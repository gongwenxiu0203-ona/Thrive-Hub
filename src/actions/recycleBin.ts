"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { type RecycleType } from "@/lib/recycleBin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function model(type: RecycleType): any {
  switch (type) {
    case "customer": return prisma.customer;
    case "contract": return prisma.contract;
    case "affiliate": return prisma.affiliate;
    case "task": return prisma.task;
    case "reminder": return prisma.reminder;
    case "salesBatch": return prisma.salesBatch;
    case "project": return prisma.project;
    case "workLog": return prisma.workLog;
  }
}

/** 恢复：清除 deletedAt，移出回收站 */
export async function restoreItem(type: RecycleType, id: string) {
  await requireSession();
  await model(type).update({ where: { id }, data: { deletedAt: null } });
  revalidatePath("/recycle-bin");
  revalidatePath("/customers");
  revalidatePath("/contracts");
  revalidatePath("/affiliates");
  revalidatePath("/tasks");
  revalidatePath("/reminders");
  revalidatePath("/bi");
}

/** 彻底删除：物理删除该条记录（不可恢复）*/
export async function purgeItem(type: RecycleType, id: string) {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("仅管理员可彻底删除");

  if (type === "customer") {
    // 渠道分账外键无级联，先清理
    await prisma.channelReconciliation.deleteMany({ where: { customerId: id } });
  }
  await model(type).delete({ where: { id } });
  revalidatePath("/recycle-bin");
}
