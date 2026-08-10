import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { calcBetAndCommission } from "@/lib/reconciliationCalc";
import { reconciliationSalesRecordWhere } from "@/lib/activeSalesScope";

// POST /api/finance/reconciliations/[id]/pull-bi
// 根据对账周期从 SalesRecord 自动拉取该客户的销售单量和销售额
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "EDIT", req);
    const { id } = await params;

    const rec = await prisma.customerReconciliation.findFirst({ where: scopedReconciliationWhere(id, access.scope) });
    if (!rec) return NextResponse.json({ error: "对账记录不存在或您无权访问" }, { status: 404 });
    if (rec.status !== "DRAFT") {
      return NextResponse.json({ error: "只有草稿状态可以重新拉取 BI 数据" }, { status: 400 });
    }
    if (rec.reconcileType === "FEE_ONLY") {
      return NextResponse.json({ error: "固费对账不关联销售数据，无需拉取 BI；请在销售佣金对账中执行此操作" }, { status: 400 });
    }

    // 聚合该客户在对账周期内的销售数据
    const agg = await prisma.salesRecord.aggregate({
      where: reconciliationSalesRecordWhere({
        customerId: rec.customerId,
        periodStart: rec.periodStart,
        periodEnd: rec.periodEnd,
      }),
      _sum: {
        orders: true,
        revenue: true,
      },
    });

    const actualOrders = agg._sum.orders ?? 0;
    const actualSalesAmount = agg._sum.revenue ?? 0;

    const calc = calcBetAndCommission({
      betType: rec.betType,
      betOrderCount: rec.betOrderCount,
      betSalesAmount: rec.betSalesAmount,
      actualOrders,
      actualSalesAmount,
      commissionRate: rec.commissionRate,
    });

    const updated = await prisma.customerReconciliation.update({
      where: { id },
      data: {
        actualOrders,
        actualSalesAmount,
        ...calc,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "拉取 BI 数据失败，请稍后重试" }, { status: 500 });
  }
}
