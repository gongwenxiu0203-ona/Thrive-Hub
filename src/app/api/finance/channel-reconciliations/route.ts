import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";

// GET /api/finance/channel-reconciliations
export async function GET(_req: Request) {
  try {
    const session = await requireSession();
    const list = await prisma.channelReconciliation.findMany({
      where: session.role === "CHANNEL" ? { channelUserId: session.userId } : undefined,
      include: {
        customer: { select: { id: true, brandName: true } },
        contract: { select: { id: true, contractNo: true } },
        customerReconciliation: {
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
            status: true,
            feeAmount: true,
            commissionAmount: true,
            finalCommissionAmount: true,
            settlements: {
              select: { id: true, type: true, status: true, actualDate: true },
            },
          },
        },
        channelUser: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(list);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// POST /api/finance/channel-reconciliations — 新建渠道商分账（v2）
// body: { customerId, contractId, customerReconciliationId, channelUserId,
//         periodNo?, periodStart?, periodEnd?, note?,
//         fixedFeeShareRate?, commissionShareRate? }
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (!isStaff(session.role)) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    const body = await req.json();
    const {
      customerId,
      contractId,
      customerReconciliationId,
      channelUserId,
      periodNo = 1,
      periodStart,
      periodEnd,
      fixedFeeShareRate = 0,
      commissionShareRate = 0,
      fixedFeeShareCurrency = "人民币",
      commissionShareCurrency = "人民币",
      note,
    } = body;

    if (!customerId || !contractId || !channelUserId) {
      return NextResponse.json(
        { error: "客户、合同、渠道商为必填项" },
        { status: 400 },
      );
    }

    // 关联月度客户对账（可选）— 用于联动到账金额
    let custRec = null;
    if (customerReconciliationId) {
      custRec = await prisma.customerReconciliation.findUnique({
        where: { id: customerReconciliationId },
        include: { settlements: true },
      });
      if (!custRec) {
        return NextResponse.json(
          { error: "关联月度对账不存在" },
          { status: 404 },
        );
      }
    }

    // 到账金额：仅当对应 Settlement 已结算才设置
    const fixedFeeSettlement = custRec?.settlements.find(
      (s) => s.type === "FIXED_FEE",
    );
    const commissionSettlement = custRec?.settlements.find(
      (s) => s.type === "COMMISSION",
    );

    const fixedFeeReceived =
      fixedFeeSettlement?.status === "SETTLED"
        ? fixedFeeSettlement.amount
        : null;
    const commissionReceived =
      commissionSettlement?.status === "SETTLED"
        ? commissionSettlement.amount
        : null;

    const fixedFeeShareAmount =
      fixedFeeReceived != null ? fixedFeeReceived * fixedFeeShareRate : 0;
    const commissionShareAmount =
      commissionReceived != null
        ? commissionReceived * commissionShareRate
        : 0;

    const now = new Date();
    const record = await prisma.channelReconciliation.create({
      data: {
        customerId,
        contractId,
        customerReconciliationId: customerReconciliationId ?? null,
        channelUserId,
        periodNo,
        periodStart: periodStart ? new Date(periodStart) : null,
        periodEnd: periodEnd ? new Date(periodEnd) : null,
        // 固费
        fixedFeeReceived,
        fixedFeeShareRate,
        fixedFeeShareAmount,
        fixedFeeShareCurrency,
        // 抽佣
        commissionReceived,
        commissionShareRate,
        commissionShareAmount,
        commissionShareCurrency,
        note,
        createdById: session.userId,
        createdAt: now,
        updatedAt: now,
      },
      include: {
        customer: { select: { id: true, brandName: true } },
        contract: { select: { id: true, contractNo: true } },
        channelUser: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
