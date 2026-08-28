import { prisma } from "@/lib/prisma";

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

/**
 * 为签署完成的合同补齐对账计划。automationKey 保证所有合同完成入口重复调用也不会重复生成。
 * 缺少客户或有效合同日期时安全跳过，由业务人员补齐后可再次触发。
 */
export async function ensureCustomerReconciliationPlan(contractId: string, actorId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: { select: { status: true, cooperationEndDate: true } } },
  });
  if (!contract || contract.status !== "COMPLETED" || !contract.customerId || !contract.startDate || !contract.endDate) {
    return { created: 0, skipped: true };
  }
  if (contract.customer?.status !== "COOPERATING") {
    return { created: 0, skipped: true, reason: "CUSTOMER_NOT_COOPERATING" };
  }
  if (contract.startDate > contract.endDate) {
    return { created: 0, skipped: true };
  }

  const now = new Date();
  const today = utcDate(now);
  const periods = buildCustomerReconciliationPlan(contract.startDate, contract.endDate);
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
    const key = automationKey(contract.id, period);
    if (existingKeys.has(key)) continue;
    const planStatus = period.start <= today ? "OPEN" : "PLANNED";
    const openedAt = planStatus === "OPEN" ? now : null;
    try {
      await prisma.customerReconciliation.create({
        data: {
          customerId: contract.customerId,
          contractId: contract.id,
          source: "AUTO",
          planStatus,
          periodIndex: period.index,
          automationKey: key,
          originalPeriodStart: period.start,
          originalPeriodEnd: period.end,
          openedAt,
          periodStart: period.start,
          periodEnd: period.end,
          partyA: contract.partyA,
          accountingPeriod: contract.accountingPeriod,
          feeCycle: contract.feeCycle,
          feeAmount: money(contract.feeAmount),
          commissionRate: rate(contract.commissionRate),
          affiliateRule: contract.affiliateRule,
          paymentCycle: contract.paymentCycle,
          fixedFeeCurrency: reconciliationCurrency(contract.feeCurrency),
          commissionCurrency: "USD",
          reconcileType: period.type,
          createdById: actorId,
          updatedAt: now,
        },
      });
      created += 1;
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
) {
  const endDate = utcDate(cooperationEndDate);
  const records = await prisma.customerReconciliation.findMany({
    where: { customerId, deletedAt: null, planStatus: { not: "CANCELLED" } },
    include: {
      settlements: { select: { status: true } },
      billingRequestLines: { select: { id: true }, take: 1 },
      receiptAllocations: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
    },
  });
  const reason = `客户结束合作，合作结束日期调整为 ${endDate.toISOString().slice(0, 10)}`;
  let cancelled = 0;
  let shortened = 0;
  let preserved = 0;

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      const hasFinancialHistory = record.status === "CONFIRMED"
        || record.settlements.some((item) => item.status === "SETTLED")
        || record.billingRequestLines.length > 0
        || record.receiptAllocations.length > 0;
      if (record.periodStart > endDate) {
        await tx.customerReconciliation.update({
          where: { id: record.id },
          data: { planStatus: "CANCELLED", adjustmentReason: reason, updatedAt: new Date() },
        });
        await tx.financeAuditLog.create({
          data: {
            entityType: "CUSTOMER_RECONCILIATION",
            entityId: record.id,
            action: "CANCEL_AFTER_COOPERATION_END",
            actorId,
            fromStatus: record.planStatus,
            toStatus: "CANCELLED",
            note: reason,
            metadata: JSON.stringify({ hasFinancialHistory, periodStart: record.periodStart, periodEnd: record.periodEnd }),
          },
        });
        cancelled += 1;
      } else if (record.periodEnd > endDate && !hasFinancialHistory) {
        await tx.customerReconciliation.update({
          where: { id: record.id },
          data: {
            periodEnd: endDate,
            periodAdjusted: true,
            adjustmentReason: reason,
            updatedAt: new Date(),
          },
        });
        await tx.reconciliationPeriodAudit.create({
          data: {
            reconciliationId: record.id,
            actorId,
            beforeStart: record.periodStart,
            beforeEnd: record.periodEnd,
            afterStart: record.periodStart,
            afterEnd: endDate,
            reason,
          },
        });
        shortened += 1;
      } else if (record.periodEnd > endDate) {
        await tx.financeAuditLog.create({
          data: {
            entityType: "CUSTOMER_RECONCILIATION",
            entityId: record.id,
            action: "COOPERATION_END_PRESERVE_FINANCIAL_HISTORY",
            actorId,
            fromStatus: record.status,
            toStatus: record.status,
            note: `${reason}；该记录已有财务历史，保留原周期`,
          },
        });
        preserved += 1;
      }
    }
  });
  return { cancelled, shortened, preserved };
}

// Contract-specific closure is intentionally kept separate from customer-wide closure.
// This local helper is not part of the reconciliation-only release being staged.
export async function closeContractReconciliationPlans(
  contractId: string,
  terminationDate: Date,
  actorId: string,
  reasonText?: string,
) {
  const endDate = utcDate(terminationDate);
  const records = await prisma.customerReconciliation.findMany({
    where: { contractId, deletedAt: null, planStatus: { not: "CANCELLED" } },
    include: {
      settlements: { select: { status: true } },
      billingRequestLines: { select: { id: true }, take: 1 },
      receiptAllocations: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
    },
  });
  const reason = reasonText?.trim() || `合同终止，终止日期调整为 ${endDate.toISOString().slice(0, 10)}`;
  let cancelled = 0;
  let shortened = 0;
  let preserved = 0;

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      const hasFinancialHistory = record.status === "CONFIRMED"
        || record.settlements.some((item) => item.status === "SETTLED")
        || record.billingRequestLines.length > 0
        || record.receiptAllocations.length > 0;
      if (record.periodStart > endDate) {
        await tx.customerReconciliation.update({
          where: { id: record.id },
          data: { planStatus: "CANCELLED", adjustmentReason: reason, updatedAt: new Date() },
        });
        await tx.financeAuditLog.create({
          data: {
            entityType: "CUSTOMER_RECONCILIATION", entityId: record.id,
            action: "CANCEL_AFTER_CONTRACT_TERMINATION", actorId,
            fromStatus: record.planStatus, toStatus: "CANCELLED", note: reason,
            metadata: JSON.stringify({ contractId, hasFinancialHistory, periodStart: record.periodStart, periodEnd: record.periodEnd }),
          },
        });
        cancelled += 1;
      } else if (record.periodEnd > endDate && !hasFinancialHistory) {
        await tx.customerReconciliation.update({
          where: { id: record.id },
          data: { periodEnd: endDate, periodAdjusted: true, adjustmentReason: reason, updatedAt: new Date() },
        });
        await tx.reconciliationPeriodAudit.create({
          data: {
            reconciliationId: record.id, actorId,
            beforeStart: record.periodStart, beforeEnd: record.periodEnd,
            afterStart: record.periodStart, afterEnd: endDate, reason,
          },
        });
        shortened += 1;
      } else if (record.periodEnd > endDate) {
        await tx.financeAuditLog.create({
          data: {
            entityType: "CUSTOMER_RECONCILIATION", entityId: record.id,
            action: "CONTRACT_TERMINATION_PRESERVE_FINANCIAL_HISTORY", actorId,
            fromStatus: record.status, toStatus: record.status,
            note: `${reason}；该记录已有财务历史，保留原周期`,
            metadata: JSON.stringify({ contractId }),
          },
        });
        preserved += 1;
      }
    }
  });
  return { cancelled, shortened, preserved };
}
