import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// POST /api/finance/reconciliations/[id]/confirm
// 双方最终确认（争议后的最终版本），锁定数据 + 创建结算记录
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const note = body.note ?? "";

    const rec = await prisma.customerReconciliation.findUnique({
      where: { id },
      include: { customer: { select: { brandName: true } } },
    });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rec.status !== "DISPUTED") {
      return NextResponse.json({ error: "只有争议状态才需要最终确认" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const finalOrders = rec.actualOrders;
      const finalSalesAmount = rec.actualSalesAmount;
      const finalCommissionAmount = rec.commissionAmount;

      await tx.customerReconciliation.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          finalOrders,
          finalSalesAmount,
          finalCommissionAmount,
          updatedAt: new Date(),
        },
      });

      await tx.reconciliationReview.create({
        data: {
          reconciliationId: id,
          reviewerId: session.userId,
          action: "FINAL_CONFIRMED",
          note,
          createdAt: new Date(),
        },
      });

      // 创建结算记录
      const now = new Date();
      if (rec.feeAmount > 0) {
        await tx.settlement.create({
          data: {
            reconciliationId: id,
            type: "FIXED_FEE",
            amount: rec.feeAmount,
            status: "PENDING",
            createdById: session.userId,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      if (finalCommissionAmount > 0) {
        await tx.settlement.create({
          data: {
            reconciliationId: id,
            type: "COMMISSION",
            amount: finalCommissionAmount,
            status: "PENDING",
            createdById: session.userId,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "确认失败" }, { status: 500 });
  }
}
