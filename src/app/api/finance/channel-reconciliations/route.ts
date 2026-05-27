import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// GET /api/finance/channel-reconciliations
export async function GET(_req: Request) {
  try {
    await requireSession();
    const list = await prisma.channelReconciliation.findMany({
      include: {
        customer: { select: { id: true, brandName: true } },
        channelUser: { select: { id: true, name: true } },
        settlement: { select: { id: true, type: true, amount: true, status: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(list);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// POST /api/finance/channel-reconciliations — 新建渠道商分账
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const {
      customerId,
      settlementId,
      channelUserId,
      fixedFeeShareRate = 0,
      fixedFeeSharePeriods = 1,
      commissionShareRate = 0,
      commissionSharePeriods = 1,
      note,
    } = body;

    if (!customerId || !settlementId || !channelUserId) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    // 确认关联结算已完成
    const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } });
    if (!settlement) return NextResponse.json({ error: "结算记录不存在" }, { status: 404 });
    if (settlement.status !== "SETTLED") {
      return NextResponse.json({ error: "渠道商分账需要客户结算已完成才能创建" }, { status: 400 });
    }

    // 计算分账金额
    const fixedFeeSharePerPeriod = settlement.type === "FIXED_FEE"
      ? settlement.amount * fixedFeeShareRate
      : 0;
    const fixedFeeShareTotal = fixedFeeSharePerPeriod * fixedFeeSharePeriods;

    const commissionSharePerPeriod = settlement.type === "COMMISSION"
      ? settlement.amount * commissionShareRate
      : 0;
    const commissionShareTotal = commissionSharePerPeriod * commissionSharePeriods;

    const totalShareAmount = fixedFeeShareTotal + commissionShareTotal;

    const now = new Date();
    const record = await prisma.channelReconciliation.create({
      data: {
        customerId,
        settlementId,
        channelUserId,
        fixedFeeShareRate,
        fixedFeeSharePerPeriod,
        fixedFeeSharePeriods,
        fixedFeeShareTotal,
        commissionShareRate,
        commissionSharePerPeriod,
        commissionSharePeriods,
        commissionShareTotal,
        totalShareAmount,
        note,
        createdById: session.userId,
        createdAt: now,
        updatedAt: now,
      },
      include: {
        customer: { select: { id: true, brandName: true } },
        channelUser: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
