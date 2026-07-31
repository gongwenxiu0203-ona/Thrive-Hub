import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { channelReconciliationScope, customerScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import {
  splitCommissionServicePeriods,
  splitFixedFeeServicePeriods,
} from "@/lib/channelSplit";

const RECEIVED_CURRENCIES = new Set(["USD", "RMB", "EUR", "GBP", "HKD"]);

function parseShanghaiDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseReceivedCurrency(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "USD";
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const aliases: Record<string, string> = {
    CNY: "RMB",
    人民币: "RMB",
    美元: "USD",
    美金: "USD",
    欧元: "EUR",
    英镑: "GBP",
    港币: "HKD",
  };
  const upper = raw.toUpperCase();
  const normalized = aliases[raw] ?? aliases[upper] ?? upper;
  return RECEIVED_CURRENCIES.has(normalized) ? normalized : null;
}

function canonicalCurrency(value: string): string {
  return value.trim().toUpperCase() === "CNY"
    ? "RMB"
    : value.trim().toUpperCase();
}

export async function GET() {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "READ");
    const list = await prisma.channelReconciliation.findMany({
      where: channelReconciliationScope(session, session.role === "ADMIN" ? "all" : "mine"),
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const customerId = typeof body.customerId === "string" ? body.customerId : "";
    const contractId = typeof body.contractId === "string" ? body.contractId : "";
    if (!customerId || !contractId) {
      return NextResponse.json({ error: "客户和合同为必填项" }, { status: 400 });
    }

    const view = session.role === "ADMIN" ? "all" : "mine";
    const customer = await prisma.customer.findFirst({
      where: { AND: [{ id: customerId, deletedAt: null }, customerScope(session, view)] },
      select: {
        id: true,
        channelUserId: true,
        splitRule: true,
      },
    });
    if (!customer) return NextResponse.json({ error: "客户不存在或无权访问" }, { status: 404 });
    if (!customer.channelUserId) {
      return NextResponse.json({ error: "该客户尚未关联渠道商" }, { status: 400 });
    }
    if (!customer.splitRule) {
      return NextResponse.json({ error: "该客户尚未配置分账规则" }, { status: 400 });
    }
    const splitRule = customer.splitRule;
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
      },
    });
    if (!contract) {
      return NextResponse.json(
        { error: "合同不存在、未签署完成、已删除或不属于所选客户" },
        { status: 404 },
      );
    }
    if (!contract.startDate) {
      return NextResponse.json({ error: "所选合同尚未填写合作开始时间" }, { status: 400 });
    }

    const start =
      body.periodStart === undefined || body.periodStart === ""
        ? contract.startDate
        : parseShanghaiDate(body.periodStart);
    const end =
      body.periodEnd === undefined || body.periodEnd === ""
        ? splitRule.splitEndDate
        : parseShanghaiDate(body.periodEnd);
    if (!start) {
      return NextResponse.json({ error: "分账开始时间格式无效" }, { status: 400 });
    }
    if (!end) {
      return NextResponse.json({ error: "分账结束时间格式无效" }, { status: 400 });
    }

    const fixedFeeReceivedCurrency =
      body.fixedFeeReceivedCurrency === undefined
        ? parseReceivedCurrency(contract.feeCurrency) ?? "USD"
        : parseReceivedCurrency(body.fixedFeeReceivedCurrency);
    const commissionReceivedCurrency = parseReceivedCurrency(
      body.commissionReceivedCurrency,
    );
    if (!fixedFeeReceivedCurrency || !commissionReceivedCurrency) {
      return NextResponse.json(
        { error: "到账货币必须为 USD、RMB、EUR、GBP 或 HKD" },
        { status: 400 },
      );
    }
    if (
      splitRule.ruleType === "A" &&
      canonicalCurrency(commissionReceivedCurrency) !==
        canonicalCurrency(splitRule.commissionThresholdCurrency)
    ) {
      return NextResponse.json(
        {
          error:
            "A 类规则的到账销售佣金货币必须与规则阈值货币一致；系统没有汇率，不能直接比较",
        },
        { status: 400 },
      );
    }

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

    const record = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.channelReconciliation.findFirst({
        where: { customerId, recordMode: "RULE_DRIVEN" },
        select: { id: true },
      });
      if (duplicate) throw new Error("DUPLICATE_RULE_DRIVEN");

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
          fixedFeeReceivedCurrency,
          commissionReceivedCurrency,
          fixedFeeShareCurrency: fixedFeeReceivedCurrency,
          commissionShareCurrency: commissionReceivedCurrency,
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
    if (
      (error instanceof Error && error.message === "DUPLICATE_RULE_DRIVEN") ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      return NextResponse.json({ error: "该客户已存在渠道商分账记录，请进入详情维护各期数据" }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
