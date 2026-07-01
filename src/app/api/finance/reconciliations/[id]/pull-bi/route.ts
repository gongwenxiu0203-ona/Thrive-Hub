import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { calcBetAndCommission } from "../route";

// POST /api/finance/reconciliations/[id]/pull-bi
// 根据对账周期从 SalesRecord 自动拉取该客户的销售单量和销售额
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (!isStaff(session.role)) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    const { id } = await params;

    const rec = await prisma.customerReconciliation.findUnique({ where: { id } });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rec.status !== "DRAFT") {
      return NextResponse.json({ error: "只有草稿状态可以重新拉取 BI 数据" }, { status: 400 });
    }

    // 聚合该客户在对账周期内的销售数据
    const agg = await prisma.salesRecord.aggregate({
      where: {
        customerId: rec.customerId,
        orderDate: {
          gte: rec.periodStart,
          lte: rec.periodEnd,
        },
      },
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
    console.error(e);
    return NextResponse.json({ error: "拉取失败" }, { status: 500 });
  }
}
