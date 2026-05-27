import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// GET /api/finance/reconciliations/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;

    const rec = await prisma.customerReconciliation.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            brandName: true,
            channelUserId: true,
            businessOwnerId: true,
            businessOwner: { select: { id: true, name: true, email: true } },
          },
        },
        contract: { select: { id: true, contractNo: true, type: true, startDate: true, endDate: true } },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        reviews: {
          include: { reviewer: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        settlements: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { type: "asc" },
        },
      },
    });

    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rec);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// PATCH /api/finance/reconciliations/[id] — 更新草稿（只允许 DRAFT 状态）
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.customerReconciliation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "DRAFT") {
      return NextResponse.json({ error: "只能修改草稿状态的对账记录" }, { status: 400 });
    }

    const allowed = [
      "periodStart", "periodEnd",
      "betType", "betOrderCount", "betSalesAmount",
      "actualOrders", "actualSalesAmount",
    ];
    const data: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (key in body) {
        if (key === "periodStart" || key === "periodEnd") {
          data[key] = new Date(body[key]);
        } else {
          data[key] = body[key];
        }
      }
    }

    // 重新计算对赌结果和佣金
    const updated = { ...existing, ...data };
    const calc = calcBetAndCommission(updated as Parameters<typeof calcBetAndCommission>[0]);
    Object.assign(data, calc);

    const result = await prisma.customerReconciliation.update({ where: { id }, data });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export function calcBetAndCommission(rec: {
  betType: string;
  betOrderCount?: number | null;
  betSalesAmount?: number | null;
  actualOrders: number;
  actualSalesAmount: number;
  commissionRate: number;
}) {
  let betResult = "NA";
  if (rec.betType === "ORDER_COUNT") {
    betResult = (rec.actualOrders >= (rec.betOrderCount ?? 0)) ? "ACHIEVED" : "NOT_ACHIEVED";
  } else if (rec.betType === "SALES_AMOUNT") {
    betResult = (rec.actualSalesAmount >= (rec.betSalesAmount ?? 0)) ? "ACHIEVED" : "NOT_ACHIEVED";
  } else if (rec.betType === "BOTH") {
    const ordersMet = rec.actualOrders >= (rec.betOrderCount ?? 0);
    const salesMet = rec.actualSalesAmount >= (rec.betSalesAmount ?? 0);
    betResult = (ordersMet && salesMet) ? "ACHIEVED" : "NOT_ACHIEVED";
  }

  const actualCommissionRate = betResult === "NOT_ACHIEVED" ? 0 : rec.commissionRate;
  const commissionAmount = rec.actualSalesAmount * actualCommissionRate;

  return { betResult, actualCommissionRate, commissionAmount };
}
