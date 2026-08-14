import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { channelReconciliationScope, financeDataView } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";

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
    if (session.role !== "ADMIN" && session.role !== "USER") {
      return NextResponse.json(
        { error: "仅内部员工可生成渠道商分账周期" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const body = await req.json();
    const { totalPeriods, periodType, fixedFeeTotal, commissionTotal } = body;

    if (!totalPeriods || totalPeriods < 1) {
      return NextResponse.json({ error: "期数必须大于0" }, { status: 400 });
    }

    const rec = await prisma.channelReconciliation.findFirst({
      where: { AND: [{ id }, channelReconciliationScope(session, financeDataView(session))] },
      include: {
        contract: { select: { startDate: true } },
        periods: {
          where: {
            OR: [
              { fixedFeePaidAt: { not: null } },
              { commissionPaidAt: { not: null } },
            ],
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!rec) return NextResponse.json({ error: "渠道商对账记录不存在、已删除或无权访问" }, { status: 404 });
    if (rec.periods.length > 0) {
      return NextResponse.json(
        { error: "已有向渠道商付款的锁定期，不能删除并重新生成周期" },
        { status: 409 },
      );
    }
    if (rec.recordMode === "RULE_DRIVEN") {
      return NextResponse.json(
        { error: "新版分账周期在创建时按服务周期自动生成，不能手动覆盖或重新生成" },
        { status: 409 },
      );
    }

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
    return errorResponse(e, "finance.channel-reconciliation.generate-periods");
  }
}
