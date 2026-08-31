import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  getReconciliationAccess,
  scopedReconciliationWhere,
} from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { recalcReconciliation, assertConfirmationReadyForSubmission } from "@/lib/reconciliationCalc";
import { errorResponse } from "@/lib/appError";

const SUPPORTED_RECONCILIATION_CURRENCIES = new Set([
  "USD", "CNY", "EUR", "GBP", "HKD", "JPY", "CAD", "AUD", "SGD",
  "CHF", "NZD", "KRW", "INR", "AED",
]);

function normalizeReconciliationCurrency(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return SUPPORTED_RECONCILIATION_CURRENCIES.has(normalized)
    ? normalized
    : null;
}

// POST /api/finance/reconciliations/[id]/review
// 客户负责人确认或提出异议
// body: { action: "APPROVED" | "DISPUTED", disputedSalesAmount?, note? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();
    // Internal editors may correct disputed amounts; approval stays a management action.
    // External roles keep the existing management-level requirement and tenant scope.
    const internalDispute = (session.role === "ADMIN" || session.role === "USER")
      && body.action === "DISPUTED";
    const access = await getReconciliationAccess(session, internalDispute ? "EDIT" : "MANAGE", req);
    if (Object.prototype.hasOwnProperty.call(body, "disputedOrders")) {
      return NextResponse.json(
        { error: "系统已取消单量异议，仅支持纠正销售额" },
        { status: 400 },
      );
    }
    const {
      action,
      disputedSalesAmount,
      correctedSalesAmount,
      disputedFeeAmount,
      correctedFeeAmount,
      salesAmountCurrency,
      correctedCurrency,
      note,
    } = body;
    const correctedSales = correctedSalesAmount ?? disputedSalesAmount;
    const correctedFee = correctedFeeAmount ?? disputedFeeAmount;
    const requestedCurrency = normalizeReconciliationCurrency(
      correctedCurrency ?? salesAmountCurrency,
    );

    if (action !== "APPROVED" && action !== "DISPUTED") {
      return NextResponse.json(
        { error: "action 只能是 APPROVED 或 DISPUTED" },
        { status: 400 },
      );
    }

    const rec = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: {
        customer: { select: { brandName: true, businessOwnerId: true } },
      },
    });
    if (!rec)
      return NextResponse.json(
        { error: "对账记录不存在或您无权访问" },
        { status: 404 },
      );
    if (rec.status !== "PENDING_REVIEW" && rec.status !== "DISPUTED") {
      return NextResponse.json(
        { error: "当前状态不允许审核操作" },
        { status: 400 },
      );
    }
    assertConfirmationReadyForSubmission(rec);
    if (
      action === "DISPUTED" &&
      rec.reconcileType !== "FEE_ONLY" &&
      (typeof correctedSales !== "number" ||
        !Number.isFinite(correctedSales) ||
        correctedSales < 0)
    ) {
      return NextResponse.json(
        { error: "提出异议时必须填写有效的纠正后销售额" },
        { status: 400 },
      );
    }
    if (
      action === "DISPUTED" &&
      rec.reconcileType === "FEE_ONLY" &&
      (typeof correctedFee !== "number" ||
        !Number.isFinite(correctedFee) ||
        correctedFee < 0)
    ) {
      return NextResponse.json(
        { error: "固费有异议时必须填写有效的异议固费金额" },
        { status: 400 },
      );
    }

    if (action === "DISPUTED" && !requestedCurrency) {
      return NextResponse.json(
        { error: "提出异议时必须选择有效币种" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      if (action === "APPROVED") {
        // 无异议 → 直接确认，生成终版数据 + 创建结算记录
        const finalOrders = rec.actualOrders;
        const finalSalesAmount = rec.actualSalesAmount;
        const finalCommissionAmount = rec.commissionAmount;
        const finalFeeAmount = rec.finalFeeAmount ?? rec.feeAmount;

        const transition = await tx.customerReconciliation.updateMany({
          where: { id, status: { in: ["PENDING_REVIEW", "DISPUTED"] } },
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
            action: "APPROVED",
            note,
            createdAt: new Date(),
          },
        });

        // 按对账流生成结算记录；查存在后再创建，避免重试产生重复结算。
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
              content: `${rec.customer.brandName} 的 ${periodStr} 月度对账已确认，请及时跟进固费和佣金的结算状态。`,
              remindDate,
              type: "SETTLEMENT_FOLLOWUP",
              targetId: rec.submittedById,
              createdById: session.userId,
            },
          });
        }
        return;
      } else {
        // 有异议 → 用争议数据重算（v3 逻辑），状态变为 DISPUTED
        const updateData: Record<string, unknown> = {
          status: "DISPUTED",
          updatedAt: new Date(),
        };
        if (rec.reconcileType !== "FEE_ONLY") {
          const actualSalesAmount = Number(correctedSales);
          const calc = await recalcReconciliation(id, { actualSalesAmount });
          Object.assign(updateData, { actualSalesAmount, ...calc });
        }
        if (rec.reconcileType === "FEE_ONLY") {
          updateData.finalFeeAmount = Number(correctedFee);
          updateData.fixedFeeCurrency = requestedCurrency;
        } else {
          updateData.commissionCurrency = requestedCurrency;
        }
        // 同步更新销售额/抽佣货币（如果审核人指定）
        await tx.customerReconciliation.update({
          where: { id },
          data: updateData,
        });

        await tx.reconciliationReview.create({
          data: {
            reconciliationId: id,
            reviewerId: session.userId,
            action: "DISPUTED",
            disputedSalesAmount:
              rec.reconcileType === "FEE_ONLY" ? null : Number(correctedSales),
            disputedFeeAmount:
              rec.reconcileType === "FEE_ONLY" ? Number(correctedFee) : null,
            note: [note, `异议金额币种：${requestedCurrency}`]
              .filter(Boolean)
              .join("；"),
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
        return null;
      }
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
    return errorResponse(e, "finance.reconciliation.review");
  }
}
