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
export const FIXED_FEE_RATE_PRESETS = [0.3, 0.5];
