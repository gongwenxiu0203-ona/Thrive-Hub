import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  getReconciliationAccess,
  scopedReconciliationWhere,
} from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";
import { assertConfirmationReadyForSubmission } from "@/lib/reconciliationCalc";

// POST /api/finance/reconciliations/[id]/confirm
// 双方最终确认（争议后的最终版本），锁定数据 + 创建结算记录
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "MANAGE", req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const note = body.note ?? "";

    const rec = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: { customer: { select: { brandName: true } } },
    });
    if (!rec)
      return NextResponse.json(
        { error: "对账记录不存在或您无权访问" },
        { status: 404 },
      );
    if (rec.status !== "DISPUTED") {
      return NextResponse.json(
        { error: "只有争议状态才需要最终确认" },
        { status: 400 },
      );
    }
    assertConfirmationReadyForSubmission(rec);

    await prisma.$transaction(async (tx) => {
      const finalOrders = rec.actualOrders;
      const finalSalesAmount = rec.actualSalesAmount;
      const finalCommissionAmount = rec.commissionAmount;
      const finalFeeAmount = rec.finalFeeAmount ?? rec.feeAmount;

      const transition = await tx.customerReconciliation.updateMany({
        where: { id, status: "DISPUTED" },
        data: {
          status: "CONFIRMED",
          finalOrders,
          finalSalesAmount,
          finalCommissionAmount,
          finalFeeAmount,
          settlementReminderSent: false,
          updatedAt: new Date(),
        },
      });
      if (transition.count !== 1)
        throw new Error("RECONCILIATION_STATE_CHANGED");

      await tx.reconciliationReview.create({
        data: {
          reconciliationId: id,
          reviewerId: session.userId,
          action: "FINAL_CONFIRMED",
          note,
          createdAt: new Date(),
        },
      });

      // 按对账流生成结算记录，并避免重复生成。
      const now = new Date();
      const settlementSpecs = [
        ...(rec.reconcileType !== "COMMISSION_ONLY" && finalFeeAmount > 0
          ? [{ type: "FIXED_FEE", amount: finalFeeAmount }]
          : []),
        ...(rec.reconcileType !== "FEE_ONLY" && finalCommissionAmount > 0
          ? [{ type: "COMMISSION", amount: finalCommissionAmount }]
          : []),
      ];
      for (const settlementSpec of settlementSpecs) {
        const existingSettlement = await tx.settlement.findFirst({
          where: { reconciliationId: id, type: settlementSpec.type },
          select: { id: true },
        });
        if (!existingSettlement) {
          await tx.settlement.create({
            data: {
              reconciliationId: id,
              type: settlementSpec.type,
              amount: settlementSpec.amount,
              status: "PENDING",
              createdById: session.userId,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
      }

      // 7天后提醒提交人跟进结算状态
      if (rec.submittedById) {
        const remindDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const periodStr = rec.periodStart.toISOString().slice(0, 7);
        await tx.reminder.create({
          data: {
            title: `【结算跟进】${rec.customer.brandName} ${periodStr} 月度对账结算待处理`,
            content: `${rec.customer.brandName} 的 ${periodStr} 月度对账已最终确认，请及时跟进固费和佣金的结算状态。`,
            remindDate,
            type: "SETTLEMENT_FOLLOWUP",
            targetId: rec.submittedById,
            createdById: session.userId,
          },
        });
      }

      return;
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === "RECONCILIATION_STATE_CHANGED") {
      return NextResponse.json(
        { error: "对账状态已被其他操作更新，请刷新页面后重试" },
        { status: 409 },
      );
    }
    if (e instanceof FeaturePermissionError)
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.reconciliation.confirm");
  }
}
