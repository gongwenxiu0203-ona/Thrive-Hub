import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  channelReconciliationScope,
  financeReferenceCustomerScope,
  isStaff,
} from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";
import {
  splitCommissionServicePeriods,
  splitFixedFeeServicePeriods,
} from "@/lib/channelSplit";

export async function GET() {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "READ");
    const list = await prisma.channelReconciliation.findMany({
      where: { AND: [{ deletedAt: null }, channelReconciliationScope(session, isStaff(session.role) ? "all" : "mine")] },
      include: {
        customer: { select: { id: true, brandName: true } },
        contract: { select: { id: true, contractNo: true } },
        customerReconciliation: { select: { id: true, periodStart: true, periodEnd: true, status: true } },
        channelUser: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        periods: { orderBy: { periodIndex: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(list);
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "登录状态已失效，请重新登录后再操作" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "EDIT");
    if (session.role !== "ADMIN" && session.role !== "USER") {
      return NextResponse.json({ error: "仅内部员工可创建渠道商分账" }, { status: 403 });
    }
    const body = await req.json();
    const confirmDuplicate = body.confirmDuplicate === true;
    const customerId = typeof body.customerId === "string" ? body.customerId : "";
    const contractId = typeof body.contractId === "string" ? body.contractId : "";
    if (!customerId || !contractId) {
      return NextResponse.json({ error: "客户和合同为必填项" }, { status: 400 });
    }

    const referenceCustomerScope = financeReferenceCustomerScope(session);
    const customer = await prisma.customer.findFirst({
      where: {
        AND: [{ id: customerId, deletedAt: null }, referenceCustomerScope],
      },
      select: {
        id: true,
        channelUserId: true,
        splitRules: { where: { contractId: null }, take: 1 },
      },
    });
    if (!customer) return NextResponse.json({ error: "客户不存在或无权访问" }, { status: 404 });
    if (!customer.channelUserId) {
      return NextResponse.json({ error: "该客户尚未关联渠道商" }, { status: 400 });
    }
    const contract = await prisma.contract.findFirst({
      where: {
        id: contractId,
        customerId,
        status: "COMPLETED",
        deletedAt: null,
      },
      select: {
        id: true,
        contractNo: true,
        startDate: true,
        endDate: true,
        feeCurrency: true,
        splitRule: true,
      },
    });
    if (!contract) {
      return NextResponse.json(
        { error: "合同不存在、未签署完成、已删除或不属于所选客户" },
        { status: 404 },
      );
    }
    const splitRule = customer.splitRules[0] ?? contract.splitRule;
    if (!splitRule) {
      return NextResponse.json({ error: "\u8be5\u5ba2\u6237\u53ca\u6240\u9009\u5408\u540c\u5747\u672a\u914d\u7f6e\u5206\u8d26\u89c4\u5219" }, { status: 400 });
    }
    if (!contract.startDate) {
      return NextResponse.json({ error: "所选合同尚未填写合作开始时间" }, { status: 400 });
    }

    // Server-authoritative range: contract start -> split-rule end.
    // Request dates and master currencies are intentionally ignored.
    const start = contract.startDate;
    const end = splitRule.splitEndDate;

    const channelUser = await prisma.user.findFirst({
      where: { id: customer.channelUserId, role: "CHANNEL", status: "APPROVED" },
      select: { id: true },
    });
    if (!channelUser) {
      return NextResponse.json({ error: "关联渠道商不存在或尚未审核通过" }, { status: 400 });
    }
    if (end.getTime() < start.getTime()) {
      return NextResponse.json({ error: "分账开始时间不能晚于结束时间" }, { status: 400 });
    }
    const fixedFeePeriods = splitFixedFeeServicePeriods(start, end);
    const commissionPeriods = splitCommissionServicePeriods(start, end);
    if (fixedFeePeriods.length === 0 || commissionPeriods.length === 0) {
      return NextResponse.json({ error: "没有可生成的分账服务周期" }, { status: 400 });
    }

    const similarRecords = await prisma.channelReconciliation.findMany({
      where: { customerId, recordMode: "RULE_DRIVEN", deletedAt: null },
      select: {
        id: true, periodStart: true, periodEnd: true, createdAt: true,
        customer: { select: { id: true, brandName: true } },
        contract: { select: { id: true, contractNo: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    if (similarRecords.length > 0 && !confirmDuplicate) {
      return NextResponse.json({
        error: "已存在相似的渠道商分账记录，请确认是否仍要新建",
        code: "SIMILAR_RECORDS",
        similarRecords: similarRecords.map((record) => ({
          id: record.id,
          customerName: record.customer.brandName,
          contractNo: record.contract?.contractNo ?? null,
          periodStart: record.periodStart,
          periodEnd: record.periodEnd,
          createdAt: record.createdAt,
        })),
      }, { status: 409 });
    }

    const record = await prisma.$transaction(async (tx) => {
      return tx.channelReconciliation.create({
        data: {
          customerId,
          channelUserId: channelUser.id,
          splitRuleId: splitRule.id,
          recordMode: "RULE_DRIVEN",
          contractId: contract.id,
          customerReconciliationId: null,
          settlementId: null,
          periodStart: start,
          periodEnd: end,
          periodNo: 1,
          periodType: "monthly",
          totalPeriods: fixedFeePeriods.length + commissionPeriods.length,
          fixedFeeShareRate: splitRule.fixedFeeRate,
          commissionShareRate:
            splitRule.ruleType === "A"
              ? splitRule.commissionBelowRate
              : 0,
          fixedFeeReceivedCurrency: "USD",
          commissionReceivedCurrency: "USD",
          fixedFeeShareCurrency: "USD",
          commissionShareCurrency: "USD",
          note: typeof body.note === "string" ? body.note.trim() || null : null,
          createdById: session.userId,
          periods: {
            create: [
              ...fixedFeePeriods.map((period) => ({
                streamType: "FIXED_FEE",
                periodIndex: period.periodIndex,
                periodLabel: period.label,
                periodStart: period.start,
                periodEnd: period.end,
                fixedFeeShareRate: splitRule.fixedFeeRate,
              })),
              ...commissionPeriods.map((period) => ({
                streamType: "COMMISSION",
                periodIndex: fixedFeePeriods.length + period.periodIndex,
                periodLabel: period.label,
                periodStart: period.start,
                periodEnd: period.end,
                commissionShareRate:
                  splitRule.ruleType === "A"
                    ? splitRule.commissionBelowRate
                    : null,
              })),
            ],
          },
        },
        include: {
          customer: { select: { id: true, brandName: true } },
          contract: {
            select: { id: true, contractNo: true, startDate: true, endDate: true },
          },
          channelUser: { select: { id: true, name: true } },
          periods: { orderBy: { periodIndex: "asc" } },
        },
      });
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return errorResponse(error, "finance.channel-reconciliations.create");
  }
}
