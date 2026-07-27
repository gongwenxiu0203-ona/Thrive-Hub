import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { channelReconciliationScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";

function periodLabel(index: number, type: string, contractStart?: Date | null): string {
  if (!contractStart) return `第${index}期`;
  const d = new Date(contractStart);
  if (type === "monthly") {
    d.setMonth(d.getMonth() + index - 1);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  } else {
    // quarterly
    d.setMonth(d.getMonth() + (index - 1) * 3);
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}年Q${q}`;
  }
}

// POST /api/finance/channel-reconciliations/[id]/generate-periods
// Body: { totalPeriods, periodType, fixedFeeTotal, commissionTotal, fixedFeeShareRate, commissionShareRate }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "MANAGE");
    const { id } = await params;
    const body = await req.json();
    const { totalPeriods, periodType, fixedFeeTotal, commissionTotal } = body;

    if (!totalPeriods || totalPeriods < 1) {
      return NextResponse.json({ error: "期数必须大于0" }, { status: 400 });
    }

    const rec = await prisma.channelReconciliation.findFirst({
      where: { AND: [{ id }, channelReconciliationScope(session, session.role === "ADMIN" ? "all" : "mine")] },
      include: { contract: { select: { startDate: true } } },
    });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const perFixedFee = fixedFeeTotal ? fixedFeeTotal / totalPeriods : null;
    const perCommission = commissionTotal ? commissionTotal / totalPeriods : null;
    const contractStart = rec.contract?.startDate ?? null;

    // Update master record config
    await prisma.channelReconciliation.update({
      where: { id },
      data: {
        totalPeriods: Number(totalPeriods),
        periodType: periodType || "monthly",
        fixedFeeTotal: fixedFeeTotal != null ? Number(fixedFeeTotal) : null,
        commissionTotal: commissionTotal != null ? Number(commissionTotal) : null,
        fixedFeeShareRate: body.fixedFeeShareRate != null ? Number(body.fixedFeeShareRate) : rec.fixedFeeShareRate,
        commissionShareRate: body.commissionShareRate != null ? Number(body.commissionShareRate) : rec.commissionShareRate,
      },
    });

    // Delete existing periods and regenerate
    await prisma.channelReconciliationPeriod.deleteMany({ where: { reconciliationId: id } });

    const periods = [];
    for (let i = 1; i <= totalPeriods; i++) {
      periods.push({
        reconciliationId: id,
        periodIndex: i,
        periodLabel: periodLabel(i, periodType || "monthly", contractStart),
        fixedFeeAmount: perFixedFee,
        commissionAmount: perCommission,
      });
    }

    await prisma.channelReconciliationPeriod.createMany({ data: periods });

    const updated = await prisma.channelReconciliation.findUnique({
      where: { id },
      include: { periods: { orderBy: { periodIndex: "asc" } } },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "生成失败" }, { status: 500 });
  }
}
