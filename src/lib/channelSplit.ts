// Channel Split: period splitting (natural-month with partial-month coefficient) +
// tiered commission calculation (progressive-tax-style on cumulative GMV).

export interface SplitPeriod {
  periodIndex: number;          // 1-based
  start: Date;
  end: Date;                    // inclusive last moment
  monthLabel: string;           // "YYYY-MM"
  daysInMonth: number;          // calendar days in this period's month
  coveredDays: number;          // days the period actually covers within that month
  coefficient: number;          // coveredDays / daysInMonth (0 < c <= 1)
}

export type ChannelSplitStreamType = "FIXED_FEE" | "COMMISSION";

export interface ServicePeriod {
  periodIndex: number;
  start: Date;
  end: Date;
  label: string;
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiDateParts(date: Date): { year: number; month: number; day: number } {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function atShanghaiStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, -8, 0, 0, 0));
}

function atShanghaiEnd(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 15, 59, 59, 999));
}

function addShanghaiDays(date: Date, days: number, endOfDay = false): Date {
  const { year, month, day } = shanghaiDateParts(date);
  return endOfDay
    ? atShanghaiEnd(year, month, day + days)
    : atShanghaiStart(year, month, day + days);
}

export function formatShanghaiDay(date: Date): string {
  const { year, month, day } = shanghaiDateParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Fixed fees use consecutive 30-calendar-day service periods.
 * The final period is clipped to the configured reconciliation end date.
 */
export function splitFixedFeeServicePeriods(start: Date, end: Date): ServicePeriod[] {
  if (end.getTime() < start.getTime()) return [];
  const startParts = shanghaiDateParts(start);
  const endParts = shanghaiDateParts(end);
  const configuredEnd = atShanghaiEnd(endParts.year, endParts.month, endParts.day);
  const periods: ServicePeriod[] = [];
  let cursor = atShanghaiStart(startParts.year, startParts.month, startParts.day);

  while (cursor.getTime() <= configuredEnd.getTime()) {
    const fullCycleEnd = addShanghaiDays(cursor, 29, true);
    const periodEnd =
      fullCycleEnd.getTime() <= configuredEnd.getTime() ? fullCycleEnd : configuredEnd;
    periods.push({
      periodIndex: periods.length + 1,
      start: cursor,
      end: periodEnd,
      label: `${formatShanghaiDay(cursor)} ~ ${formatShanghaiDay(periodEnd)}`,
    });
    cursor = addShanghaiDays(cursor, 30);
  }

  return periods;
}

/**
 * Commission periods follow calendar months, clipped by the configured
 * reconciliation start/end dates for the first and final month.
 */
export function splitCommissionServicePeriods(start: Date, end: Date): ServicePeriod[] {
  if (end.getTime() < start.getTime()) return [];
  const startParts = shanghaiDateParts(start);
  const endParts = shanghaiDateParts(end);
  const configuredStart = atShanghaiStart(startParts.year, startParts.month, startParts.day);
  const configuredEnd = atShanghaiEnd(endParts.year, endParts.month, endParts.day);
  const periods: ServicePeriod[] = [];
  let year = startParts.year;
  let month = startParts.month;

  while (year < endParts.year || (year === endParts.year && month <= endParts.month)) {
    const calendarStart = atShanghaiStart(year, month, 1);
    const calendarEnd = atShanghaiEnd(year, month + 1, 0);
    const periodStart =
      calendarStart.getTime() < configuredStart.getTime() ? configuredStart : calendarStart;
    const periodEnd =
      calendarEnd.getTime() > configuredEnd.getTime() ? configuredEnd : calendarEnd;
    periods.push({
      periodIndex: periods.length + 1,
      start: periodStart,
      end: periodEnd,
      label: `${year}-${String(month + 1).padStart(2, "0")}`,
    });
    month += 1;
    if (month === 12) {
      year += 1;
      month = 0;
    }
  }

  return periods;
}

/** Last day of the month containing d, at 23:59:59.999 */
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** First day of next month at 00:00:00 */
function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

function daysInMonthOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function monthLabel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Split [start, end] into one period per calendar month.
 * Partial months produce coefficient < 1 (= coveredDays / daysInMonth).
 *
 * Example: start=2026-06-16, end=2026-09-30
 *   P1: 06-16~06-30 coef=15/30=0.5
 *   P2: 07-01~07-31 coef=1.0
 *   P3: 08-01~08-31 coef=1.0
 *   P4: 09-01~09-30 coef=1.0
 */
export function splitPeriodsByMonth(start: Date, end: Date): SplitPeriod[] {
  if (end.getTime() < start.getTime()) return [];
  const periods: SplitPeriod[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  let idx = 1;

  while (cursor.getTime() <= end.getTime()) {
    const monthEnd = endOfMonth(cursor);
    const periodEnd = monthEnd.getTime() < end.getTime() ? monthEnd : end;
    const dim = daysInMonthOf(cursor);
    // covered days = day-of-month diff inclusive on both ends
    const covered = periodEnd.getDate() - cursor.getDate() + 1;
    periods.push({
      periodIndex: idx,
      start: new Date(cursor),
      end: new Date(periodEnd),
      monthLabel: monthLabel(cursor),
      daysInMonth: dim,
      coveredDays: covered,
      coefficient: covered / dim,
    });
    idx += 1;
    cursor = startOfNextMonth(cursor);
  }
  return periods;
}

export interface TierBracket {
  gmvMin: number;            // inclusive lower bound
  gmvMax: number | null;     // exclusive upper bound; null = +infinity
  rate: number;              // 0.0~1.0
}

/**
 * Validate + normalize tier brackets:
 *  - non-negative gmvMin
 *  - gmvMax null OR > gmvMin
 *  - rates within [0,1]
 *  - sorted by gmvMin ascending
 *  - contiguous coverage from 0 (auto-clamps gaps but does not synthesize)
 */
export function parseTieredRules(raw: unknown): TierBracket[] {
  if (!Array.isArray(raw)) return [];
  const list: TierBracket[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const min = Number(obj.gmvMin);
    const maxRaw = obj.gmvMax;
    const max = maxRaw === null || maxRaw === undefined || maxRaw === "" ? null : Number(maxRaw);
    const rate = Number(obj.rate);
    if (!Number.isFinite(min) || min < 0) continue;
    if (max !== null && (!Number.isFinite(max) || max <= min)) continue;
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) continue;
    list.push({ gmvMin: min, gmvMax: max, rate });
  }
  list.sort((a, b) => a.gmvMin - b.gmvMin);
  return list;
}

/**
 * Progressive-tax-style commission on cumulative GMV.
 * For period GMV = G, split G into tier slices and sum (slice * rate).
 *
 * Example brackets:
 *   [0-100k @ 15%]  [100k-500k @ 20%]  [500k-null @ 25%]
 * Period GMV = 300_000
 *   Slice [0-100k]:    100_000 * 0.15 = 15_000
 *   Slice [100k-300k]: 200_000 * 0.20 = 40_000
 *   Total = 55_000
 *
 * Returns the commission share amount (not the rate).
 */
export function calcTieredCommission(periodGmv: number, brackets: TierBracket[]): number {
  if (!Number.isFinite(periodGmv) || periodGmv <= 0) return 0;
  let total = 0;
  for (const b of brackets) {
    const upper = b.gmvMax === null ? periodGmv : Math.min(b.gmvMax, periodGmv);
    if (upper <= b.gmvMin) continue;
    const slice = upper - b.gmvMin;
    total += slice * b.rate;
    if (b.gmvMax !== null && periodGmv <= b.gmvMax) break;
  }
  return total;
}

/**
 * Per-period fixed-fee share = monthly fixed fee * rate * period coefficient.
 * monthlyFixedFee is the "待支付固费金额" from the matched CustomerReconciliation.
 */
export function calcFixedFeeShare(monthlyFixedFee: number, rate: number, coefficient: number): number {
  if (!Number.isFinite(monthlyFixedFee) || monthlyFixedFee <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return monthlyFixedFee * rate * coefficient;
}

/**
 * Per-period commission share for Rule A (single flat rate).
 * monthlyCommission is the "待支付抽佣金额" from the matched CustomerReconciliation.
 */
export function calcFlatCommissionShare(monthlyCommission: number, rate: number): number {
  if (!Number.isFinite(monthlyCommission) || monthlyCommission <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return monthlyCommission * rate;
}

// UI labels (intentionally Chinese)
export const RULE_TYPE_LABELS: Record<string, string> = {
  A: "A 基础分账规则",
  B: "B 特殊分账规则（阶梯）",
};

export const COMMISSION_RATE_PRESETS = [0.15, 0.25];
export const FIXED_FEE_RATE_PRESETS = [0.15, 0.25];

export const BASIC_COMMISSION_THRESHOLD_USD = 4_400;
export const BASIC_COMMISSION_BELOW_RATE = 0.15;
export const BASIC_COMMISSION_AT_OR_ABOVE_RATE = 0.25;

export function selectBasicCommissionRate(
  receivedCommissionUsd: number,
  threshold = BASIC_COMMISSION_THRESHOLD_USD,
  belowRate = BASIC_COMMISSION_BELOW_RATE,
  atOrAboveRate = BASIC_COMMISSION_AT_OR_ABOVE_RATE,
): number {
  if (!Number.isFinite(receivedCommissionUsd) || receivedCommissionUsd < 0) {
    throw new Error("Thraive 到账销售佣金必须是非负数");
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error("佣金分账阈值无效");
  }
  if (![belowRate, atOrAboveRate].every((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 1)) {
    throw new Error("佣金分账比例必须在 0~100% 之间");
  }
  return receivedCommissionUsd < threshold ? belowRate : atOrAboveRate;
}

export function calculateShareAmount(received: number | null, rate: number): number {
  if (received === null) return 0;
  if (!Number.isFinite(received) || received < 0) throw new Error("到账金额必须是非负数");
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error("分账比例必须在 0~100% 之间");
  return Math.round((received * rate + Number.EPSILON) * 100) / 100;
}

export function parseNonNegativeAmount(value: unknown, fieldLabel: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${fieldLabel}必须是非负数`);
  return amount;
}

export function appendAuditEntry(
  raw: string | null | undefined,
  entry: Record<string, unknown>,
): string {
  let entries: unknown[] = [];
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) throw new Error("分账审计日志格式无效");
    entries = parsed;
  } catch {
    throw new Error("分账审计日志格式无效，已拒绝覆盖历史审计数据");
  }
  entries.push(entry);
  return JSON.stringify(entries);
}

/**
 * Add N workdays to a date (skips Sat/Sun; does NOT consider PRC holidays).
 * addWorkdays(Mon, 1) = Tue;   addWorkdays(Fri, 1) = next Mon
 * addWorkdays(Sat, 1) = next Tue (Sat itself is not a workday; result skips Sun too)
 * Negative n moves backward.
 */
export function addWorkdays(start: Date, n: number): Date {
  const d = new Date(start.getTime());
  const direction = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setDate(d.getDate() + direction);
    const dow = d.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}

/**
 * Per-period derived view = matched CustomerReconciliation amounts + share calcs.
 * Pure: no DB access. Pass the matched CR row (or null if no match yet).
 */
export interface PeriodDerivedInput {
  periodIndex: number;
  monthLabel: string;            // "YYYY-MM"
  coefficient: number;           // 0~1
  // From matched CustomerReconciliation (status CONFIRMED) or null:
  confirmedFee: number | null;        // CR.feeAmount
  confirmedGmv: number | null;        // CR.finalSalesAmount ?? actualSalesAmount
  confirmedCommission: number | null; // CR.finalCommissionAmount ?? commissionAmount
  // From matching Settlements (per-type actualDate or null):
  feeReceivedAt: string | null;
  commissionReceivedAt: string | null;
  // From rule:
  fixedFeeRate: number;
  ruleType: "A" | "B";
  flatCommissionRate: number;        // A only (0 for B)
  tierBrackets: TierBracket[];       // B only ([] for A)
}

export interface PeriodDerived {
  periodIndex: number;
  monthLabel: string;
  coefficient: number;
  // 7 columns the user asked for:
  confirmedFee: number | null;
  fixedFeeRate: number;
  channelReceivableFee: number | null;          // confirmedFee * fixedFeeRate * coefficient
  confirmedGmv: number | null;
  confirmedCommission: number | null;
  channelCommissionRate: number;                // A: flat; B: effective = share / commission (or 0 if commission null)
  channelReceivableCommission: number | null;   // A: confirmedCommission * rate; B: calcTieredCommission(GMV, brackets) (capped by confirmedCommission)
  // Timing:
  feeReceivedAt: string | null;
  commissionReceivedAt: string | null;
  dueDate: string | null;                       // max(feeReceived,commReceived) + 7 workdays
}

export function deriveChannelPeriod(input: PeriodDerivedInput): PeriodDerived {
  const fee = input.confirmedFee;
  const receivableFee = fee !== null
    ? fee * input.fixedFeeRate * input.coefficient
    : null;

  let receivableCommission: number | null = null;
  let channelCommissionRate = 0;

  if (input.ruleType === "A") {
    channelCommissionRate = input.flatCommissionRate;
    receivableCommission = input.confirmedCommission !== null
      ? input.confirmedCommission * input.flatCommissionRate
      : null;
  } else {
    // B: 阶梯佣金 按累计 GMV 分段（个税口径），上限 = confirmedCommission（不能超出客户对账已确认的佣金池）
    if (input.confirmedGmv !== null && input.confirmedGmv > 0) {
      const raw = calcTieredCommission(input.confirmedGmv, input.tierBrackets);
      receivableCommission = input.confirmedCommission !== null
        ? Math.min(raw, input.confirmedCommission)
        : raw;
      channelCommissionRate = raw / input.confirmedGmv; // effective rate, for display
    }
  }

  let dueDate: string | null = null;
  const dates = [input.feeReceivedAt, input.commissionReceivedAt].filter((x): x is string => !!x);
  if (dates.length > 0) {
    const latest = dates.map((s) => new Date(s).getTime()).reduce((a, b) => Math.max(a, b));
    dueDate = addWorkdays(new Date(latest), 7).toISOString();
  }

  return {
    periodIndex: input.periodIndex,
    monthLabel: input.monthLabel,
    coefficient: input.coefficient,
    confirmedFee: fee,
    fixedFeeRate: input.fixedFeeRate,
    channelReceivableFee: receivableFee,
    confirmedGmv: input.confirmedGmv,
    confirmedCommission: input.confirmedCommission,
    channelCommissionRate,
    channelReceivableCommission: receivableCommission,
    feeReceivedAt: input.feeReceivedAt,
    commissionReceivedAt: input.commissionReceivedAt,
    dueDate,
  };
}
