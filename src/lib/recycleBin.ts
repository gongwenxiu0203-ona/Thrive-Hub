// 回收站：软删除 + 7 天保留 + 到期物理清理
// 覆盖实体：客户 / 合同 / 联盟商 / 任务 / 提醒 / 推广批次
import { prisma } from "./prisma";

export const RECYCLE_DAYS = 7;

/** 距离永久清理还剩多少天（向上取整；<=0 表示已到期）*/
export function daysRemaining(deletedAt: Date | string | null | undefined): number {
  if (!deletedAt) return RECYCLE_DAYS;
  const deleted = new Date(deletedAt).getTime();
  const expireAt = deleted + RECYCLE_DAYS * 24 * 60 * 60 * 1000;
  const ms = expireAt - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export type RecycleType = "customer" | "contract" | "affiliate" | "task" | "reminder" | "salesBatch" | "project";

export const RECYCLE_TYPE_LABELS: Record<RecycleType, string> = {
  customer: "客户",
  contract: "合同",
  affiliate: "联盟商",
  task: "任务",
  reminder: "提醒",
  salesBatch: "推广数据批次",
  project: "项目",
};

/**
 * 物理清理所有超过 7 天的软删除记录。
 * 在访问回收站 / 各列表时调用，惰性清理（无需 cron）。
 */
export async function purgeExpired(): Promise<void> {
  const cutoff = new Date(Date.now() - RECYCLE_DAYS * 24 * 60 * 60 * 1000);
  const where = { deletedAt: { not: null, lt: cutoff } };

  try {
    // 客户：渠道分账外键无级联，需先清理子记录
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expiredCustomers = await (prisma.customer.findMany as any)({
      where, select: { id: true },
    }) as { id: string }[];
    if (expiredCustomers.length) {
      const ids = expiredCustomers.map((c) => c.id);
      await prisma.channelReconciliation.deleteMany({ where: { customerId: { in: ids } } });
      await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    }

    // 合同
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.contract.deleteMany as any)({ where });

    // 联盟商
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.affiliate.deleteMany as any)({ where });

    // 任务 / 提醒
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.task.deleteMany as any)({ where });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.reminder.deleteMany as any)({ where });

    // 推广批次：删除批次会级联其销售记录
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.salesBatch.deleteMany as any)({ where });

    // 项目：删除项目会级联其时间流条目
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.project.deleteMany as any)({ where });
  } catch (e) {
    console.error("[recycleBin] purgeExpired error:", e);
  }
}

/** 列表查询通用过滤：排除已软删除 */
export const notDeleted = { deletedAt: null };
