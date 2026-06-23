// Pure helpers for project KPI computation. Server-only utilities; no Prisma
// client embedded here — callers pass aggregated data in. This keeps the
// functions trivially testable and reusable across the dashboard summary,
// the operations KPI tab, and the project detail page.

import { prisma } from "@/lib/prisma";

/** "YYYY-MM" → { start: 2026-06-01 00:00 UTC, endExclusive: 2026-07-01 00:00 UTC } */
export function monthRange(yyyyMM: string): { start: Date; endExclusive: Date } {
  const [yStr, mStr] = yyyyMM.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const endExclusive = new Date(Date.UTC(y, m, 1));
  return { start, endExclusive };
}

export function currentMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** completionRate = actual / target. Returns null if target <= 0 (caller renders "—"). */
export function completionRate(target: number, actual: number): number | null {
  if (!target || target <= 0) return null;
  return actual / target;
}

/** "是否达标"：>= 80% 为达标。target=0 时返回 null（"未设置目标"）。 */
export function isAchieved(target: number, actual: number): boolean | null {
  if (!target || target <= 0) return null;
  return actual / target >= 0.8;
}

/** BI 实际 GMV：按 SalesRecord.brand + orderDate 月份聚合 revenue。
 *  brandName 缺失或空字符串时返回 0。 */
export async function computeBiGmv(
  brandName: string | null | undefined,
  yyyyMM: string,
): Promise<number> {
  if (!brandName?.trim()) return 0;
  const { start, endExclusive } = monthRange(yyyyMM);
  const agg = await prisma.salesRecord.aggregate({
    where: {
      brand: brandName,
      orderDate: { gte: start, lt: endExclusive },
    },
    _sum: { revenue: true },
  });
  return agg._sum.revenue ?? 0;
}

/** 客户对账 GMV：仅 status=CONFIRMED 的对账，按 customerId（可选叠加 contractId）+ 月份区间相交。
 *  优先用 finalSalesAmount（CONFIRMED 锁定值），其次 actualSalesAmount。
 *  整笔计入匹配月份（不按天数摊分）。 */
export async function computeReconciliationGmv(
  customerId: string | null | undefined,
  contractId: string | null | undefined,
  yyyyMM: string,
): Promise<number> {
  if (!customerId) return 0;
  const { start, endExclusive } = monthRange(yyyyMM);
  // 区间相交：periodStart < monthEnd AND periodEnd > monthStart
  const rows = await prisma.customerReconciliation.findMany({
    where: {
      customerId,
      ...(contractId ? { contractId } : {}),
      status: "CONFIRMED",
      deletedAt: null,
      AND: [
        { periodStart: { lt: endExclusive } },
        { periodEnd: { gt: start } },
      ],
    },
    select: { finalSalesAmount: true, actualSalesAmount: true },
  });
  let total = 0;
  for (const r of rows) {
    const v = r.finalSalesAmount != null && r.finalSalesAmount > 0
      ? r.finalSalesAmount
      : r.actualSalesAmount;
    total += v ?? 0;
  }
  return total;
}

/** 给定一组 channel 的占比合计 (0-100+)。 */
export function sumSharePercent(channels: { sharePercent: number }[]): number {
  return channels.reduce((acc, c) => acc + (c.sharePercent || 0), 0);
}

/** 渠道 GMV 金额 = monthlyTarget × sharePercent / 100 */
export function channelGmv(monthlyTarget: number, sharePercent: number): number {
  return monthlyTarget * (sharePercent || 0) / 100;
}
