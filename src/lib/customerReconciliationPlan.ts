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
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract || contract.status !== "COMPLETED" || !contract.customerId || !contract.startDate || !contract.endDate) {
    return { created: 0, skipped: true };
  }
  if (contract.startDate > contract.endDate) {
    return { created: 0, skipped: true };
  }

  const now = new Date();
  const today = utcDate(now);
  const periods = buildCustomerReconciliationPlan(contract.startDate, contract.endDate);
  let created = 0;

  for (const period of periods) {
    const key = automationKey(contract.id, period);
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
          commissionCurrency: reconciliationCurrency(contract.thresholdCurrency || contract.feeCurrency),
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
