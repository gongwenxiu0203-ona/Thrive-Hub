"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { type RecycleType } from "@/lib/recycleBin";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { contractScope, customerScope, isStaff, projectScope, salesScope, taskScope } from "@/lib/dataScope";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function model(type: RecycleType): any {
  switch (type) {
    case "customer": return prisma.customer;
    case "contract": return prisma.contract;
    case "affiliate": return prisma.affiliate;
    case "task": return prisma.task;
    case "reminder": return prisma.reminder;
    case "salesBatch": return prisma.salesBatch;
    case "salesRecord": return prisma.salesRecord;
    case "project": return prisma.project;
    case "workLog": return prisma.workLog;
  }
}

/** 恢复：清除 deletedAt，移出回收站 */
export async function restoreItem(type: RecycleType, id: string) {
  const session = await requireSession();
  const view = isStaff(session.role) ? "all" : "mine";
  let where: Record<string, unknown> = { id };
  switch (type) {
    case "customer":
      await requireFeaturePermission(session, "customers.records", "MANAGE");
      where = { AND: [{ id }, customerScope(session, view)] };
      break;
    case "contract":
      await requireFeaturePermission(session, "contracts.records", "MANAGE");
      where = { AND: [{ id }, contractScope(session, view)] };
      break;
    case "affiliate":
      await requireFeaturePermission(session, "affiliates.records", "MANAGE");
      break;
    case "task":
      await requireFeaturePermission(session, "tasks.board", "MANAGE");
      where = { AND: [{ id }, taskScope(session, view)] };
      break;
    case "reminder":
      await requireFeaturePermission(session, "reminders.records", "MANAGE");
      where = { id };
      break;
    case "salesRecord":
      await requireFeaturePermission(session, "bi.manage", "MANAGE");
      where = { AND: [{ id }, salesScope(session, view)] };
      break;
    case "salesBatch":
      await requireFeaturePermission(session, "bi.manage", "MANAGE");
      where = { id };
      break;
    case "project":
      await requireFeaturePermission(session, "projects.records", "MANAGE");
      where = { AND: [{ id }, projectScope(session, view)] };
      break;
    case "workLog":
      await requireFeaturePermission(session, "worklogs.records", "MANAGE");
      break;
  }
  const existing = await model(type).findFirst({ where, select: { id: true } });
  if (!existing) throw new Error("记录不存在或无权恢复");
  await model(type).update({ where: { id: existing.id }, data: { deletedAt: null } });
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
