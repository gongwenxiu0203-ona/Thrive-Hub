import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureEffectiveConfirmationPlans } from "@/lib/contractConfirmationPlan";
import { hasBillableFixedFee, reconciliationOverlapWhere } from "./reconciliationGenerationRules";

function reconciliationCurrency(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (["美金", "美元", "US$", "$"].includes(normalized)) return "USD";
  if (["人民币", "人民币元", "RMB", "¥", "￥"].includes(normalized)) return "CNY";
  return normalized || "USD";
}

export type ReconciliationPlanPeriod = {
  type: "FEE_ONLY" | "COMMISSION_ONLY";
  index: number;
  start: Date;
  end: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

/**
 * 固费：合同开始日算第 1 天，每连续 30 个自然日一期。
 * 示例：1 月 15 日至 2 月 13 日为第一期，下一期从 2 月 14 日开始。
 */
export function buildFixedFeePeriods(startDate: Date, endDate: Date): ReconciliationPlanPeriod[] {
  const contractStart = utcDate(startDate);
  const contractEnd = utcDate(endDate);
  if (contractStart > contractEnd) return [];

  const periods: ReconciliationPlanPeriod[] = [];
  let start = contractStart;
  let index = 1;
  while (start <= contractEnd) {
    const end = new Date(Math.min(addUtcDays(start, 29).getTime(), contractEnd.getTime()));
    periods.push({ type: "FEE_ONLY", index, start, end });
    start = addUtcDays(end, 1);
    index += 1;
  }
  return periods;
}

/** 佣金：首期从合同开始日到当月月末，之后按自然月，末期截止合同结束日。 */
export function buildCommissionPeriods(startDate: Date, endDate: Date): ReconciliationPlanPeriod[] {
  const contractStart = utcDate(startDate);
  const contractEnd = utcDate(endDate);
  if (contractStart > contractEnd) return [];

  const periods: ReconciliationPlanPeriod[] = [];
  let start = contractStart;
  let index = 1;
  while (start <= contractEnd) {
    const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const end = new Date(Math.min(monthEnd.getTime(), contractEnd.getTime()));
    periods.push({ type: "COMMISSION_ONLY", index, start, end });
    start = addUtcDays(end, 1);
    index += 1;
  }
  return periods;
}

export function buildCustomerReconciliationPlan(startDate: Date, endDate: Date): ReconciliationPlanPeriod[] {
  return [
    ...buildFixedFeePeriods(startDate, endDate),
    ...buildCommissionPeriods(startDate, endDate),
  ];
}

export type ManualReconciliationContractInput = {
  contractId: string;
  contractStart: Date;
  contractEnd: Date;
};

export type ManualReconciliationContractPlan = ManualReconciliationContractInput & {
  periods: ReconciliationPlanPeriod[];
};

/**
 * Builds the period drafts for manual reconciliation creation.
 *
 * A single selected contract keeps the existing editable date-range behaviour.
 * When several contracts are selected, every contract is planned independently
 * from its own effective dates so contracts with different terms never share a
 * synthetic range.
 */
export function buildManualReconciliationContractPlans(input: {
  contracts: ManualReconciliationContractInput[];
  reconcileTypes: ReconciliationPlanPeriod["type"][];
  requestedStart?: Date | null;
  requestedEnd?: Date | null;
}): ManualReconciliationContractPlan[] {
  const selectedTypes = new Set(input.reconcileTypes);
  const isSingleContract = input.contracts.length === 1;

  return input.contracts.map((contract) => {
    const start = isSingleContract && input.requestedStart
      ? input.requestedStart
      : contract.contractStart;
    const end = isSingleContract && input.requestedEnd
      ? input.requestedEnd
      : contract.contractEnd;

    return {
      ...contract,
      contractStart: start,
      contractEnd: end,
      periods: buildCustomerReconciliationPlan(start, end).filter((period) =>
        selectedTypes.has(period.type),
      ),
    };
  });
}

function money(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rate(value: string | null): number {
  const parsed = money(value);
  return parsed > 1 ? parsed / 100 : parsed;
}

function automationKey(contractId: string, period: ReconciliationPlanPeriod): string {
  return `contract:${contractId}:${period.type}:${period.index}`;
}

/** Explicit, idempotent setup for the original fee terms of a signed legacy contract. */
export async function ensureLegacyBillingUnits(contractId: string, actorId: string) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract || contract.deletedAt || contract.type !== "BRAND" || contract.contractMode === "FRAMEWORK" || contract.status !== "COMPLETED" || !contract.startDate || !contract.endDate) {
    return [];
  }
  const kinds: ReconciliationPlanPeriod["type"][] = hasBillableFixedFee(contract)
    ? ["FEE_ONLY", "COMMISSION_ONLY"] : ["COMMISSION_ONLY"];
  await Promise.all(kinds.map((kind) => prisma.contractLegacyBillingUnit.upsert({
    where: { contractId_key: { contractId, key: kind === "FEE_ONLY" ? "ORIGINAL_FIXED_FEE" : "ORIGINAL_COMMISSION" } },
    create: {
      contractId,
      key: kind === "FEE_ONLY" ? "ORIGINAL_FIXED_FEE" : "ORIGINAL_COMMISSION",
      title: kind === "FEE_ONLY" ? "原合同固定服务费" : "原合同销售佣金",
      kind,
      startDate: contract.startDate!, endDate: contract.endDate!,
      scopeSnapshot: JSON.stringify({ targetSite: contract.targetSite, promoPlatform: contract.promoPlatform, coopChannels: contract.coopChannels }),
      termsSnapshot: JSON.stringify({ feeCycle: contract.feeCycle, feeAmount: contract.feeAmount, feeCurrency: contract.feeCurrency, commissionType: contract.commissionType, commissionRate: contract.commissionRate, commissionConfig: contract.commissionConfig, affiliateRule: contract.affiliateRule }),
      createdById: actorId,
    },
    update: {},
  })));
  return prisma.contractLegacyBillingUnit.findMany({
    where: { contractId, key: { in: ["ORIGINAL_FIXED_FEE", "ORIGINAL_COMMISSION"] } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * 为签署完成的合同补齐对账计划。automationKey 保证所有合同完成入口重复调用也不会重复生成。
 * 缺少客户或有效合同日期时安全跳过，由业务人员补齐后可再次触发。
 */
export async function ensureCustomerReconciliationPlan(contractId: string, actorId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: { select: { status: true, cooperationEndDate: true } } },
  });
  if (contract?.contractMode === "FRAMEWORK") {
    return ensureEffectiveConfirmationPlans(contract.id);
  }
  if (!contract || contract.deletedAt || contract.type !== "BRAND" || contract.status !== "COMPLETED" || !contract.customerId || !contract.startDate || !contract.endDate) {
    return { created: 0, skipped: true };
  }
  if (contract.customer?.status !== "COOPERATING") {
    return { created: 0, skipped: true, reason: "CUSTOMER_NOT_COOPERATING" };
  }
  if (contract.startDate > contract.endDate) {
    return { created: 0, skipped: true };
  }

  // A pre-existing signed contract may embed multiple projects that the old
  // scalar fields cannot distinguish. Never classify its old plans merely
  // because someone opened the finance page; require explicit review first.
  const [unitCount, oldPlanCount] = await Promise.all([
    prisma.contractLegacyBillingUnit.count({ where: { contractId: contract.id } }),
    prisma.customerReconciliation.count({ where: { contractId: contract.id, projectConfirmationId: null, deletedAt: null } }),
  ]);
  if (unitCount === 0 && oldPlanCount > 0) {
    return { created: 0, skipped: true, reason: "LEGACY_BILLING_REVIEW_REQUIRED" };
  }

  const now = new Date();
  const today = utcDate(now);
  const customerId = contract.customerId;
  // Legacy signed documents may contain several independently terminable fee terms.
  // Preserve their original contract fields and create stable billing identities;
  // existing historical reconciliation rows are never recalculated from live terms.
  const units = await ensureLegacyBillingUnits(contract.id, actorId);
  const periods = units.flatMap((unit) => unit.kind === "FEE_ONLY"
    ? buildFixedFeePeriods(unit.startDate, unit.endDate)
    : buildCommissionPeriods(unit.startDate, unit.endDate));
  const unitKinds = [...new Set(periods.map((period) => period.type))];
  const unitByKind = new Map(units.map((unit) => [unit.kind, unit]));
  // Only attach old draft rows whose type is unambiguous and that have no
  // financial history. Confirmed or mixed-type rows stay as historical facts.
  const unassigned = await prisma.customerReconciliation.findMany({
    where: { contractId: contract.id, projectConfirmationId: null, legacyBillingUnitId: null, reconcileType: { in: unitKinds }, status: "DRAFT", periodEnd: { gte: today }, deletedAt: null },
    include: { settlements: { select: { id: true }, take: 1 }, billingRequestLines: { select: { id: true }, take: 1 }, receiptAllocations: { select: { id: true }, take: 1 } },
  });
  for (const record of unassigned) {
    if (record.settlements.length || record.billingRequestLines.length || record.receiptAllocations.length) continue;
    const unit = unitByKind.get(record.reconcileType);
    if (unit) await prisma.customerReconciliation.update({ where: { id: record.id }, data: { legacyBillingUnitId: unit.id } });
  }
  const keys = periods.map((period) => automationKey(contract.id, period));
  const existingKeys = new Set(
    (
      await prisma.customerReconciliation.findMany({
        where: { automationKey: { in: keys } },
        select: { automationKey: true },
      })
    )
      .map((record) => record.automationKey)
      .filter((key): key is string => Boolean(key)),
  );
  let created = 0;

  for (const period of periods) {
    const unit = unitByKind.get(period.type);
    if (!unit) continue;
    const terms = JSON.parse(unit.termsSnapshot) as { feeCycle?: string | null; feeAmount?: string | null; feeCurrency?: string | null; commissionRate?: string | null; affiliateRule?: string | null };
    const effectiveEnd = unit.terminatedAt && unit.terminatedAt < unit.endDate ? unit.terminatedAt : unit.endDate;
    if (period.start > effectiveEnd) continue;
    const key = automationKey(contract.id, period);
    if (existingKeys.has(key)) continue;
    const planStatus = period.start <= today ? "OPEN" : "PLANNED";
    const openedAt = planStatus === "OPEN" ? now : null;
    try {
      const inserted = await prisma.$transaction(async (tx) => {
        const overlap = await tx.customerReconciliation.findFirst({
          where: reconciliationOverlapWhere(contract.id, period), select: { id: true },
        });
        if (overlap) return false;
        await tx.customerReconciliation.create({
        data: {
          customerId,
          contractId: contract.id,
          legacyBillingUnitId: unit.id,
          source: "AUTO",
          planStatus,
          periodIndex: period.index,
          automationKey: key,
          originalPeriodStart: period.start,
          originalPeriodEnd: period.end,
          openedAt,
          periodStart: period.start,
          periodEnd: period.end > effectiveEnd ? effectiveEnd : period.end,
          partyA: contract.partyA,
          accountingPeriod: contract.accountingPeriod,
          feeCycle: terms.feeCycle ?? contract.feeCycle,
          feeAmount: money(terms.feeAmount ?? contract.feeAmount),
          commissionRate: rate(terms.commissionRate ?? contract.commissionRate),
          affiliateRule: terms.affiliateRule ?? contract.affiliateRule,
          paymentCycle: contract.paymentCycle,
          fixedFeeCurrency: reconciliationCurrency(terms.feeCurrency ?? contract.feeCurrency),
          commissionCurrency: "USD",
          reconcileType: period.type,
          createdById: actorId,
          updatedAt: now,
        },
        });
        return true;
      });
      if (inserted) created += 1;
    } catch (error) {
      // 并发完成入口可能同时触发；唯一幂等键冲突视为已创建。
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }

  return { created, skipped: false };
}

export async function ensureCustomerPlansForCooperatingCustomer(customerId: string, actorId: string) {
  const contracts = await prisma.contract.findMany({
    where: { customerId, status: "COMPLETED", deletedAt: null },
    select: { id: true },
  });
  let created = 0;
  for (const contract of contracts) {
    const result = await ensureCustomerReconciliationPlan(contract.id, actorId);
    created += result.created;
  }
  return { created, contracts: contracts.length };
}

export async function closeCustomerReconciliationPlans(
  customerId: string,
  cooperationEndDate: Date,
  actorId: string,
  tx?: Prisma.TransactionClient,
) {
  const date = utcDate(cooperationEndDate);
  const reason = `客户结束合作，合作结束日期调整为 ${date.toISOString().slice(0, 10)}`;
  const close = (client: Prisma.TransactionClient) => closePlans(client, { customerId }, date, actorId, reason, "COOPERATION_END");
  return tx ? close(tx) : prisma.$transaction(close);
}

export async function closeContractReconciliationPlans(
  contractId: string,
  terminationDate: Date,
  actorId: string,
  reasonText?: string,
  tx?: Prisma.TransactionClient,
) {
  const date = utcDate(terminationDate);
  const reason = reasonText?.trim() || `合同终止，终止日期调整为 ${date.toISOString().slice(0, 10)}`;
  const close = (client: Prisma.TransactionClient) => closePlans(client, { contractId }, date, actorId, reason, "CONTRACT_TERMINATION");
  return tx ? close(tx) : prisma.$transaction(close);
}

export async function closeLegacyBillingUnitReconciliationPlans(
  legacyBillingUnitId: string,
  terminationDate: Date,
  actorId: string,
  reason: string,
  tx: Prisma.TransactionClient,
) {
  return closePlans(tx, { legacyBillingUnitId }, utcDate(terminationDate), actorId, reason, "LEGACY_BILLING_UNIT_TERMINATION");
}

async function closePlans(
  tx: Prisma.TransactionClient,
  scope: { customerId: string } | { contractId: string } | { legacyBillingUnitId: string },
  endDate: Date,
  actorId: string,
  reason: string,
  action: "COOPERATION_END" | "CONTRACT_TERMINATION" | "LEGACY_BILLING_UNIT_TERMINATION",
) {
  const records = await tx.customerReconciliation.findMany({
    where: { ...scope, deletedAt: null, planStatus: { not: "CANCELLED" } },
    include: {
      settlements: { select: { status: true } },
      billingRequestLines: { select: { id: true }, take: 1 },
      billingAllocations: { select: { id: true }, take: 1 },
      invoiceLinks: { select: { id: true }, take: 1 },
      receiptAllocations: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
    },
  });
  const hasFinancialHistory = (record: (typeof records)[number]) => record.status === "CONFIRMED"
    || record.settlements.some((item) => item.status === "SETTLED")
    || record.billingRequestLines.length > 0
    || record.billingAllocations.length > 0
    || record.invoiceLinks.length > 0
    || record.receiptAllocations.length > 0;
  if (action === "LEGACY_BILLING_UNIT_TERMINATION" && records.some((record) => record.periodEnd > endDate && hasFinancialHistory(record))) {
    throw new Error("终止日期涉及已确认、已开票、已结算或已收款的对账记录，请先核对财务记录后重试");
  }
  let cancelled = 0;
  let shortened = 0;
  let preserved = 0;
  for (const record of records) {
    if (record.periodEnd > endDate && hasFinancialHistory(record) && action !== "LEGACY_BILLING_UNIT_TERMINATION") {
      await tx.financeAuditLog.create({ data: {
        entityType: "CUSTOMER_RECONCILIATION", entityId: record.id,
        action: `${action}_PRESERVE_FINANCIAL_HISTORY`, actorId,
        fromStatus: record.status, toStatus: record.status,
        note: `${reason}；该记录已有财务历史，保留原周期与状态`,
        metadata: JSON.stringify({ ...scope, periodStart: record.periodStart, periodEnd: record.periodEnd }),
      } });
      preserved += 1;
      continue;
    }
    if (record.periodStart > endDate) {
      await tx.customerReconciliation.update({ where: { id: record.id }, data: { planStatus: "CANCELLED", adjustmentReason: reason } });
      await tx.financeAuditLog.create({ data: {
        entityType: "CUSTOMER_RECONCILIATION", entityId: record.id,
        action: `CANCEL_AFTER_${action}`, actorId, fromStatus: record.planStatus,
        toStatus: "CANCELLED", note: reason,
        metadata: JSON.stringify({ ...scope, periodStart: record.periodStart, periodEnd: record.periodEnd }),
      } });
      cancelled += 1;
    } else if (record.periodEnd > endDate) {
      await tx.customerReconciliation.update({ where: { id: record.id }, data: { periodEnd: endDate, periodAdjusted: true, adjustmentReason: reason } });
      await tx.reconciliationPeriodAudit.create({ data: {
        reconciliationId: record.id, actorId, beforeStart: record.periodStart, beforeEnd: record.periodEnd,
        afterStart: record.periodStart, afterEnd: endDate, reason,
      } });
      shortened += 1;
    }
  }
  return { cancelled, shortened, preserved };
}
