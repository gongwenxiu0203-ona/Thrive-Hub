"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function createReminder(fd: FormData) {
  const session = await requireSession();
  await requireFeaturePermission(session, "reminders.records", "EDIT");
  const title = str(fd, "title");
  const remindDate = str(fd, "remindDate");
  if (!title) throw new Error("提醒标题为必填项");
  if (!remindDate) throw new Error("提醒日期为必填项");

  await prisma.reminder.create({
    data: {
      title,
      content: str(fd, "content") || null,
      remindDate: new Date(remindDate),
      type: str(fd, "type") || "FOLLOWUP",
      targetId: str(fd, "targetId") || session.userId,
      createdById: session.userId,
    },
  });
  revalidatePath("/reminders");
}

export async function updateReminder(id: string, fd: FormData) {
  const session = await requireSession();
  await requireFeaturePermission(session, "reminders.records", "EDIT");
  const title = str(fd, "title");
  const remindDate = str(fd, "remindDate");
  if (!title) throw new Error("提醒标题为必填项");
  if (!remindDate) throw new Error("提醒日期为必填项");

  const existing = await prisma.reminder.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error("提醒不存在或无权修改");
  await prisma.reminder.update({
    where: { id: existing.id },
    data: {
      title,
      content: str(fd, "content") || null,
      remindDate: new Date(remindDate),
      type: str(fd, "type") || "FOLLOWUP",
      targetId: str(fd, "targetId"),
    },
  });
  revalidatePath("/reminders");
}

export async function deleteReminder(id: string) {
  const session = await requireSession();
  await requireFeaturePermission(session, "reminders.records", "MANAGE");
  // 软删除：进回收站
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.reminder.update as any)({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/reminders");
}

export async function toggleRead(id: string, isRead: boolean) {
  const session = await requireSession();
  const permission = await requireFeaturePermission(session, "reminders.records", "EDIT");
  const existing = await prisma.reminder.findFirst({
    where: { id, deletedAt: null, ...(permission === "MANAGE" ? {} : { targetId: session.userId }) },
    select: { id: true },
  });
  if (!existing) throw new Error("提醒不存在或无权操作");
  await prisma.reminder.update({ where: { id: existing.id }, data: { isRead } });
  revalidatePath("/reminders");
  revalidatePath("/dashboard");
}

export async function markAllRead() {
  const session = await requireSession();
  await requireFeaturePermission(session, "reminders.records", "EDIT");
  await prisma.reminder.updateMany({
    where: { targetId: session.userId, isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/reminders");
  revalidatePath("/dashboard");
}
