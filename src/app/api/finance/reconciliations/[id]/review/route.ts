import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { recalcReconciliation } from "../route";

// POST /api/finance/reconciliations/[id]/review
// 客户负责人确认或提出异议
// body: { action: "APPROVED" | "DISPUTED", disputedOrders?, disputedSalesAmount?, note? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "MANAGE", req);
    const { id } = await params;
    const body = await req.json();
    const { action, disputedOrders, disputedSalesAmount, salesAmountCurrency, note } = body;

    if (action !== "APPROVED" && action !== "DISPUTED") {
      return NextResponse.json({ error: "action 只能是 APPROVED 或 DISPUTED" }, { status: 400 });
    }

    const rec = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: { customer: { select: { brandName: true, businessOwnerId: true } } },
    });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rec.status !== "PENDING_REVIEW" && rec.status !== "DISPUTED") {
      return NextResponse.json({ error: "当前状态不允许审核操作" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      if (action === "APPROVED") {
        // 无异议 → 直接确认，生成终版数据 + 创建结算记录
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
            settlementReminderSent: false,
            updatedAt: new Date(),
          },
        });

        await tx.reconciliationReview.create({
          data: {
            reconciliationId: id,
            reviewerId: session.userId,
            action: "APPROVED",
            note,
            createdAt: new Date(),
          },
        });

        // 自动创建结算记录（固费 + 抽佣）
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

        // 7天后提醒提交人跟进结算状态
        if (rec.submittedById) {
          const remindDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const periodStr = rec.periodStart.toISOString().slice(0, 7);
          await tx.reminder.create({
            data: {
              title: `【结算跟进】${rec.customer.brandName} ${periodStr} 月度对账结算待处理`,
              content: `${rec.customer.brandName} 的 ${periodStr} 月度对账已确认，请及时跟进固费和佣金的结算状态。`,
              remindDate,
              type: "SETTLEMENT_FOLLOWUP",
              targetId: rec.submittedById,
              createdById: session.userId,
            },
          });
        }
      } else {
        // 有异议 → 用争议数据重算（v3 逻辑），状态变为 DISPUTED
        const actualOrders = disputedOrders ?? rec.actualOrders;
        const actualSalesAmount = disputedSalesAmount ?? rec.actualSalesAmount;
        const calc = await recalcReconciliation(id, { actualSalesAmount });

        const updateData: Record<string, unknown> = {
          status: "DISPUTED",
          actualOrders,
          actualSalesAmount,
          ...calc,
          updatedAt: new Date(),
        };
        // 同步更新销售额/抽佣货币（如果审核人指定）
        if (salesAmountCurrency) {
          updateData.commissionCurrency = salesAmountCurrency;
        }

        await tx.customerReconciliation.update({
          where: { id },
          data: updateData,
        });

        await tx.reconciliationReview.create({
          data: {
            reconciliationId: id,
            reviewerId: session.userId,
            action: "DISPUTED",
            disputedOrders,
            disputedSalesAmount,
            note,
            createdAt: new Date(),
          },
        });

        // 通知原提交人
        if (rec.submittedById) {
          await tx.reminder.create({
            data: {
              title: `【对账异议】${rec.customer.brandName} 月度对账有异议`,
              content: `${rec.customer.brandName} 对账方提出异议，请确认数据后重新提交。`,
              remindDate: new Date(),
              type: "RECONCILIATION_REVIEW",
              targetId: rec.submittedById,
              createdById: session.userId,
            },
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
