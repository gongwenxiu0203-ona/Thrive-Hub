import { Prisma } from "@prisma/client";
import { parseCommissionConfig } from "@/lib/contractCommissionConfig";
import { prisma } from "@/lib/prisma";

export const RECEIVABLE_TASK_CATEGORY = {
  MONTHLY_FEE: "RECEIVABLE_MONTHLY_FEE",
  GMV: "RECEIVABLE_GMV",
} as const;

type ReceivableTaskKind = keyof typeof RECEIVABLE_TASK_CATEGORY;

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

export type ReceivableTaskRunIssue = {
  contractId: string;
  contractNo: string;
  reason: "AMBIGUOUS_AM" | "MISSING_AM";
};

export type ReceivableTaskRunResult = {
  scannedContracts: number;
  eligibleTasks: number;
  createdTasks: number;
  existingTasks: number;
  skippedFutureTasks: number;
  issues: ReceivableTaskRunIssue[];
};

function calendarDate(date: Date): CalendarDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function shanghaiCalendarDate(date: Date): CalendarDate {
  const shanghai = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    year: shanghai.getUTCFullYear(),
    month: shanghai.getUTCMonth() + 1,
    day: shanghai.getUTCDate(),
  };
}

function fromCalendarDate(value: CalendarDate): Date {
  return new Date(Date.UTC(value.year, value.month - 1, value.day));
}

function addCalendarDays(date: Date, days: number): Date {
  const result = fromCalendarDate(calendarDate(date));
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function nextMonthFifth(date: Date): Date {
  const value = calendarDate(date);
  return new Date(Date.UTC(value.year, value.month, 5));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function displayDate(date: Date): string {
  const { year, month, day } = calendarDate(date);
  return `${year}年${month}月${day}日`;
}

/**
 * Monthly service-fee collection dates: start + 28 days, then every 28 days,
 * never later than the contract end date.
 */
export function buildMonthlyFeeDueDates(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const end = fromCalendarDate(calendarDate(endDate));
  let due = addCalendarDays(startDate, 28);

  while (due.getTime() <= end.getTime()) {
    dates.push(due);
    due = addCalendarDays(due, 28);
  }
  return dates;
}

/**
 * GMV collection dates: the fifth of the month after contract start, monthly,
 * through (and including) the fifth of the month after contract end.
 */
export function buildGmvDueDates(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  let due = nextMonthFifth(startDate);
  const lastDue = nextMonthFifth(endDate);

  while (due.getTime() <= lastDue.getTime()) {
    dates.push(due);
    due = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 5));
  }
  return dates;
}

function positiveNumber(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  const text = String(value ?? "").trim();
  if (!text) return false;
  const normalized = text.replace(/[,，￥¥$€£%\s]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0;
}

export function hasMonthlyFee(contract: { feeAmount: string | null }): boolean {
  return positiveNumber(contract.feeAmount);
}

export function hasGmvCommission(contract: {
  commissionRate: string | null;
  commissionConfig: string;
  excessCommissionRate: string | null;
  specialCommissionTerms: string | null;
  affiliateRule: string | null;
}): boolean {
  if (positiveNumber(contract.commissionRate) || positiveNumber(contract.excessCommissionRate)) {
    return true;
  }

  const config = parseCommissionConfig(contract.commissionConfig);
  const rateCandidates: unknown[] = [
    config.fixed?.rate,
    config.threshold?.reachedRate,
    config.threshold?.unreachedRate,
    config.incremental?.excessRate,
    config.special?.attributionRate,
    config.special?.creatorRate,
    config.special?.lowGmvBudgetRate,
    config.special?.highGmvServiceRate,
    ...(config.tiered?.tiers?.map((tier) => tier.rate) ?? []),
  ];
  if (rateCandidates.some(positiveNumber)) return true;

  return [contract.specialCommissionTerms, contract.affiliateRule].some((value) => {
    const text = String(value ?? "").trim();
    return text.length > 0 && !/^(无|none|n\/a)$/i.test(text);
  });
}

type ContractForAutomation = Prisma.ContractGetPayload<{
  include: {
    customer: { include: { backendOwner: true } };
    projects: { include: { owner: true } };
  };
}>;

function resolveAm(contract: ContractForAutomation):
  | { ownerId: string }
  | { issue: ReceivableTaskRunIssue["reason"] } {
  const activeProjectOwnerIds = new Set(
    contract.projects
      .filter(
        (project) =>
          project.type === "INTEGRATED" &&
          project.status === "ACTIVE" &&
          !project.deletedAt &&
          project.owner?.status === "APPROVED" &&
          (project.owner.role === "ADMIN" || project.owner.role === "USER"),
      )
      .map((project) => project.ownerId)
      .filter((ownerId): ownerId is string => Boolean(ownerId)),
  );

  if (activeProjectOwnerIds.size > 1) return { issue: "AMBIGUOUS_AM" };
  if (activeProjectOwnerIds.size === 1) {
    return { ownerId: [...activeProjectOwnerIds][0] };
  }

  const fallback = contract.customer?.backendOwner;
  if (
    fallback &&
    fallback.status === "APPROVED" &&
    (fallback.role === "ADMIN" || fallback.role === "USER")
  ) {
    return { ownerId: fallback.id };
  }
  return { issue: "MISSING_AM" };
}

function automationKey(contractId: string, kind: ReceivableTaskKind, dueDate: Date): string {
  return `receivable:${kind.toLowerCase()}:${contractId}:${dateKey(dueDate)}`;
}

/**
 * Creates all collection tasks due on or before `throughDate`. This makes the
 * daily job self-healing after downtime. The unique automation key guarantees
 * idempotency and the update branch deliberately does not overwrite a manual
 * owner reassignment.
 */
export async function generateReceivableTasks(
  throughDate = new Date(),
): Promise<ReceivableTaskRunResult> {
  const today = fromCalendarDate(shanghaiCalendarDate(throughDate));
  const contracts = await prisma.contract.findMany({
    where: {
      status: "COMPLETED",
      deletedAt: null,
      customerId: { not: null },
      startDate: { not: null },
      endDate: { not: null },
    },
    include: {
      customer: { include: { backendOwner: true } },
      projects: { include: { owner: true } },
    },
  });

  const result: ReceivableTaskRunResult = {
    scannedContracts: contracts.length,
    eligibleTasks: 0,
    createdTasks: 0,
    existingTasks: 0,
    skippedFutureTasks: 0,
    issues: [],
  };

  for (const contract of contracts) {
    if (!contract.startDate || !contract.endDate || !contract.customerId) continue;
    if (contract.endDate.getTime() < contract.startDate.getTime()) continue;

    const schedules: Array<{ kind: ReceivableTaskKind; dueDates: Date[] }> = [];
    if (hasMonthlyFee(contract)) {
      schedules.push({
        kind: "MONTHLY_FEE",
        dueDates: buildMonthlyFeeDueDates(contract.startDate, contract.endDate),
      });
    }
    if (hasGmvCommission(contract)) {
      schedules.push({
        kind: "GMV",
        dueDates: buildGmvDueDates(contract.startDate, contract.endDate),
      });
    }
    if (schedules.length === 0) continue;

    const resolved = resolveAm(contract);
    if ("issue" in resolved) {
      result.issues.push({
        contractId: contract.id,
        contractNo: contract.contractNo,
        reason: resolved.issue,
      });
      continue;
    }

    for (const schedule of schedules) {
      for (let index = 0; index < schedule.dueDates.length; index += 1) {
        const dueDate = schedule.dueDates[index];
        result.eligibleTasks += 1;
        if (dueDate.getTime() > today.getTime()) {
          result.skippedFutureTasks += 1;
          continue;
        }

        const key = automationKey(contract.id, schedule.kind, dueDate);
        const label = schedule.kind === "MONTHLY_FEE" ? "月费收取" : "GMV抽佣收取";
        const description = [
          `客户：${contract.customer?.brandName ?? "—"}`,
          `合同：${contract.contractNo}`,
          `应收日期：${displayDate(dueDate)}`,
          `期数：第 ${index + 1} 期`,
          schedule.kind === "MONTHLY_FEE"
            ? `合同月费：${contract.feeAmount ?? "—"} ${contract.feeCurrency ?? ""}`.trim()
            : "请完成当期 GMV 对账并跟进抽佣收取。",
        ].join("\n");

        try {
          await prisma.task.create({
            data: {
              automationKey: key,
              title: `${label} · ${contract.customer?.brandName ?? contract.contractNo} · 第${index + 1}期`,
              description,
              customerId: contract.customerId,
              contractId: contract.id,
              ownerId: resolved.ownerId,
              publisherId: resolved.ownerId,
              priority: "HIGH",
              category: RECEIVABLE_TASK_CATEGORY[schedule.kind],
              status: "TODO",
              dueDate,
            },
          });
          result.createdTasks += 1;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            result.existingTasks += 1;
            continue;
          }
          throw error;
        }
      }
    }
  }

  return result;
}
