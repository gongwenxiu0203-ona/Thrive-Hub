import { prisma } from "@/lib/prisma";

export const TRASH_RETENTION_DAYS = 7;

/**
 * 永久删除已超过 7 天的软删除记录。
 * Lazy cleanup：列表查询时调用，无需 cron。
 */
export async function purgeExpiredTrashedReconciliations(): Promise<number> {
  const threshold = new Date(
    Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await prisma.customerReconciliation.deleteMany({
    where: {
      deletedAt: { lt: threshold },
      status: { not: "CONFIRMED" },
      settlements: { none: { status: "SETTLED" } },
    },
  });
  return result.count;
}

/**
 * 剩余可恢复天数（基于 deletedAt + 7 天保留期）
 * 返回 0 时表示已过期，应被清理
 */
export function daysRemaining(deletedAt: Date | string): number {
  const d = new Date(deletedAt).getTime();
  const expireAt = d + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const remaining = Math.ceil(
    (expireAt - Date.now()) / (24 * 60 * 60 * 1000),
  );
  return Math.max(0, remaining);
}
