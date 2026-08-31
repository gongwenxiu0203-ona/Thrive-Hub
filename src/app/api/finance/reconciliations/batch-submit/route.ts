import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { recalcReconciliation } from "@/lib/reconciliationCalc";
import { errorResponse } from "@/lib/appError";
import { resolveSubmissionAmounts } from "@/lib/reconciliationSubmissionAmounts";

const MAX_BATCH_SIZE = 100;
type SubmitMode = "CUSTOMER_REVIEW" | "SKIP_CUSTOMER";
type Decision = {
  reconciliationId: string;
  decision: "APPROVED" | "DISPUTED";
  correctedSalesAmount?: number;
  correctedFeeAmount?: number;
  correctedCurrency?: string;
};
class BatchSubmitConflict extends Error {}

const SUPPORTED_RECONCILIATION_CURRENCIES = new Set([
  "USD", "CNY", "EUR", "GBP", "HKD", "JPY", "CAD", "AUD", "SGD",
  "CHF", "NZD", "KRW", "INR", "AED",
]);

function streamLabel(type: string) {
  return type === "FEE_ONLY" ? "固费对账" : "销售佣金对账";
}
function currencyKey(value: string) {
  const clean = value.trim().toUpperCase();
  if (["人民币", "人民币元", "¥", "RMB", "CNY"].includes(clean)) return "CNY";
  if (["美金", "美元", "$", "USD"].includes(clean)) return "USD";
  return clean;
}

function normalizedDecisionCurrency(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = currencyKey(value);
  return SUPPORTED_RECONCILIATION_CURRENCIES.has(normalized)
    ? normalized
    : undefined;
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "EDIT", request);
    const body = await request.json().catch(() => ({}));
    const rawIds: unknown[] = Array.isArray(body.reconciliationIds)
      ? body.reconciliationIds
      : [];
    const ids = Array.from(
      new Set(
        rawIds.filter(
          (id): id is string => typeof id === "string" && Boolean(id),
        ),
      ),
    );
    if (!ids.length)
      return NextResponse.json(
        { error: "请至少选择一条对账记录" },
        { status: 400 },
      );
    if (ids.length > MAX_BATCH_SIZE)
      return NextResponse.json(
        { error: `单次最多提交 ${MAX_BATCH_SIZE} 条对账记录` },
        { status: 400 },
      );

    const submitMode: SubmitMode =
      body.submitMode === "SKIP_CUSTOMER" ? "SKIP_CUSTOMER" : "CUSTOMER_REVIEW";
    const submittedToUserId =
      typeof body.submittedToUserId === "string" && body.submittedToUserId
        ? body.submittedToUserId
        : undefined;
    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
    const deadline =
      typeof body.submittedDeadline === "string" && body.submittedDeadline
        ? new Date(body.submittedDeadline)
        : null;
    if (deadline && Number.isNaN(deadline.getTime()))
      return NextResponse.json(
        { error: "提交截止时间格式无效" },
        { status: 400 },
      );
    if (submitMode === "CUSTOMER_REVIEW" && !submittedToUserId)
      return NextResponse.json(
        { error: "提交客户确认时必须选择确认人" },
        { status: 400 },
      );
    if (submittedToUserId) {
      const target = await prisma.user.findFirst({
        where: { id: submittedToUserId, status: "APPROVED" },
        select: { id: true },
      });
      if (!target)
        return NextResponse.json(
          { error: "指定确认人不存在或尚未通过审核" },
          { status: 400 },
        );
    }

    const records = await prisma.customerReconciliation.findMany({
      where: { AND: [{ id: { in: ids }, deletedAt: null }, access.scope] },
      include: { customer: { select: { brandName: true } } },
      orderBy: { periodStart: "asc" },
    });
    if (records.length !== ids.length)
      return NextResponse.json(
        { error: "部分对账记录不存在、已删除或您无权访问" },
        { status: 404 },
      );
    if (new Set(records.map((record) => record.customerId)).size !== 1)
      return NextResponse.json(
        { error: "批量提交仅支持同一客户" },
        { status: 400 },
      );
    if (records.some((record) => record.reconcileType === "BOTH"))
      return NextResponse.json(
        { error: "历史合并对账为只读，不能提交" },
        { status: 409 },
      );
    const invalid = records.find(
      (record) => !["DRAFT", "DISPUTED"].includes(record.status),
    );
    if (invalid)
      return NextResponse.json(
        { error: `${streamLabel(invalid.reconcileType)}当前状态不允许提交` },
        { status: 409 },
      );

    const decisionMap = new Map<string, Decision>();
    const calcMap = new Map<
      string,
      Awaited<ReturnType<typeof recalcReconciliation>>
    >();
    if (submitMode === "SKIP_CUSTOMER") {
      const decisions: unknown[] = Array.isArray(body.decisions)
        ? body.decisions
        : [];
      for (const raw of decisions) {
        if (!raw || typeof raw !== "object") continue;
        const value = raw as Record<string, unknown>;
        if (
          typeof value.reconciliationId !== "string" ||
          !["APPROVED", "DISPUTED"].includes(String(value.decision))
        )
          continue;
        decisionMap.set(value.reconciliationId, {
          reconciliationId: value.reconciliationId,
          decision: value.decision as Decision["decision"],
          correctedSalesAmount:
            value.correctedSalesAmount == null
              ? undefined
              : Number(value.correctedSalesAmount),
          correctedFeeAmount:
            value.correctedFeeAmount == null
              ? undefined
              : Number(value.correctedFeeAmount),
          correctedCurrency: normalizedDecisionCurrency(value.correctedCurrency),
        });
      }
      if (
        decisionMap.size !== records.length ||
        records.some((record) => !decisionMap.has(record.id))
      ) {
        return NextResponse.json(
          { error: "跳过客户确认时，必须为每条对账选择无异议或有异议" },
          { status: 400 },
        );
      }
      for (const record of records) {
        const decision = decisionMap.get(record.id)!;
        if (decision.decision !== "DISPUTED") continue;
        if (!decision.correctedCurrency) {
          return NextResponse.json(
            { error: "有异议时必须为每条记录选择有效币种" },
            { status: 400 },
          );
        }
        if (record.reconcileType === "FEE_ONLY") {
          if (
            !Number.isFinite(decision.correctedFeeAmount) ||
            Number(decision.correctedFeeAmount) < 0
          )
            return NextResponse.json(
              { error: "固费有异议时必须填写有效的异议固费金额" },
              { status: 400 },
            );
          continue;
        }
        if (
          !Number.isFinite(decision.correctedSalesAmount) ||
          Number(decision.correctedSalesAmount) < 0
        ) {
          return NextResponse.json(
            { error: "销售佣金有异议时必须填写有效的纠正后销售额" },
            { status: 400 },
          );
        }
        calcMap.set(
          record.id,
          await recalcReconciliation(record.id, {
            actualSalesAmount: Number(decision.correctedSalesAmount),
          }),
        );
      }
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        if (submitMode === "CUSTOMER_REVIEW") {
          const updated = await tx.customerReconciliation.updateMany({
            where: {
              id: record.id,
              status: { in: ["DRAFT", "DISPUTED"] },
              deletedAt: null,
            },
            data: {
              status: "PENDING_REVIEW",
              submittedById: session.userId,
              submittedAt: now,
              submittedToUserId,
              submittedDeadline: deadline,
              updatedAt: now,
            },
          });
          if (updated.count !== 1)
            throw new BatchSubmitConflict("对账状态已变化，请刷新后重试");
          await tx.reconciliationReview.create({
            data: {
              reconciliationId: record.id,
              reviewerId: session.userId,
              action: "SUBMITTED",
              note,
              createdAt: now,
            },
          });
          await tx.reminder.create({
            data: {
              title: `【对账审核】${record.customer.brandName} ${streamLabel(record.reconcileType)}待确认`,
              content: `${record.customer.brandName} 的${streamLabel(record.reconcileType)}已提交，请及时确认。`,
              remindDate: now,
              type: "RECONCILIATION_REVIEW",
              targetId: submittedToUserId!,
              createdById: session.userId,
            },
          });
          continue;
        }

        const decision = decisionMap.get(record.id)!;
        const calc = calcMap.get(record.id);
        const { correctedSales, correctedFee, finalCommission } = resolveSubmissionAmounts(
          record, decision, calc?.commissionAmount,
        );
        const updated = await tx.customerReconciliation.updateMany({
          where: {
            id: record.id,
            status: { in: ["DRAFT", "DISPUTED"] },
            deletedAt: null,
          },
          data: {
            status: "CONFIRMED",
            submittedById: session.userId,
            submittedAt: now,
            submittedToUserId: null,
            submittedDeadline: null,
            actualSalesAmount: correctedSales,
            ...(calc ?? {}),
            finalOrders: record.actualOrders,
            finalSalesAmount: correctedSales,
            finalCommissionAmount: finalCommission,
            finalFeeAmount: correctedFee,
            ...(decision.decision === "DISPUTED"
              ? record.reconcileType === "FEE_ONLY"
                ? { fixedFeeCurrency: decision.correctedCurrency }
                : { commissionCurrency: decision.correctedCurrency }
              : {}),
            settlementReminderSent: false,
            updatedAt: now,
          },
        });
        if (updated.count !== 1)
          throw new BatchSubmitConflict("对账状态已变化，请刷新后重试");
        await tx.reconciliationReview.create({
          data: {
            reconciliationId: record.id,
            reviewerId: session.userId,
            action: decision.decision === "DISPUTED" ? "DISPUTED" : "APPROVED",
            disputedSalesAmount:
              decision.decision === "DISPUTED" &&
              record.reconcileType !== "FEE_ONLY"
                ? correctedSales
                : null,
            disputedFeeAmount:
              decision.decision === "DISPUTED" &&
              record.reconcileType === "FEE_ONLY"
                ? correctedFee
                : null,
            note: note || "跳过客户确认",
            createdAt: now,
          },
        });
        if (decision.decision === "DISPUTED") {
          await tx.reconciliationReview.create({
            data: {
              reconciliationId: record.id,
              reviewerId: session.userId,
              action: "FINAL_CONFIRMED",
              note: `${record.reconcileType === "FEE_ONLY" ? "按纠正固费金额" : "按纠正销售额"}直接确认；币种：${decision.correctedCurrency}`,
              createdAt: now,
            },
          });
        }
        const specs =
          record.reconcileType === "FEE_ONLY"
            ? [{ type: "FIXED_FEE", amount: correctedFee }]
            : [{ type: "COMMISSION", amount: finalCommission }];
        for (const spec of specs.filter((item) => item.amount > 0)) {
          const exists = await tx.settlement.findFirst({
            where: { reconciliationId: record.id, type: spec.type },
            select: { id: true },
          });
          if (!exists)
            await tx.settlement.create({
              data: {
                reconciliationId: record.id,
                type: spec.type,
                amount: spec.amount,
                status: "PENDING",
                createdById: session.userId,
                createdAt: now,
                updatedAt: now,
              },
            });
        }
      }

      return;
    });

    if (submitMode === "CUSTOMER_REVIEW")
      return NextResponse.json({ success: true, submitted: records.length });
    return NextResponse.json({ success: true, confirmed: records.length });
  } catch (error) {
    if (error instanceof FeaturePermissionError)
      return NextResponse.json({ error: "无权提交客户对账" }, { status: 403 });
    if (error instanceof BatchSubmitConflict)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return errorResponse(error, "finance.reconciliation.batch-submit");
  }
}
