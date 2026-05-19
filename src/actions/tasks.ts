"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { TASK_STATUS_ORDER } from "@/lib/constants";
import { bumpCustomerStatus } from "@/lib/customer";
import { sendMeetingInvite } from "@/lib/notify";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function createTask(fd: FormData) {
  await requireSession();
  const title = str(fd, "title");
  if (!title) throw new Error("任务标题为必填项");

  const status = str(fd, "status") || "TODO";
  const count = await prisma.task.count({ where: { status } });
  const dueDate = str(fd, "dueDate");

  await prisma.task.create({
    data: {
      title,
      description: str(fd, "description") || null,
      customerId: str(fd, "customerId") || null,
      ownerId: str(fd, "ownerId") || null,
      publisherId: str(fd, "publisherId") || null,
      priority: str(fd, "priority") || "MID",
      category: str(fd, "category") || "GENERAL",
      status,
      dueDate: dueDate ? new Date(dueDate) : null,
      sortOrder: count,
    },
  });
  revalidatePath("/tasks");
}

export async function updateTask(id: string, fd: FormData) {
  await requireSession();
  const title = str(fd, "title");
  if (!title) throw new Error("任务标题为必填项");
  const dueDate = str(fd, "dueDate");

  await prisma.task.update({
    where: { id },
    data: {
      title,
      description: str(fd, "description") || null,
      customerId: str(fd, "customerId") || null,
      ownerId: str(fd, "ownerId") || null,
      publisherId: str(fd, "publisherId") || null,
      priority: str(fd, "priority") || "MID",
      category: str(fd, "category") || "GENERAL",
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  revalidatePath("/tasks");
}

/** Lightweight content edit from the task detail panel (title + description). */
export async function updateTaskContent(
  id: string,
  title: string,
  description: string,
) {
  await requireSession();
  if (!title.trim()) throw new Error("任务标题不能为空");
  await prisma.task.update({
    where: { id },
    data: { title: title.trim(), description: description.trim() || null },
  });
  revalidatePath("/tasks");
}

export async function deleteTask(id: string) {
  await requireSession();
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tasks");
}

/** Kanban drag — move to a new column and persist that column's order. */
export async function moveTask(
  taskId: string,
  toStatus: string,
  orderedIds: string[],
) {
  await requireSession();
  if (!TASK_STATUS_ORDER.includes(toStatus)) {
    throw new Error("无效的任务状态");
  }
  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { status: toStatus } }),
    ...orderedIds.map((id, index) =>
      prisma.task.update({ where: { id }, data: { sortOrder: index } }),
    ),
  ]);
  await syncTaskSideEffects(taskId, toStatus);
  revalidatePath("/tasks");
}

/** Plain status change used by the detail-panel action buttons. */
export async function setTaskStatus(id: string, status: string) {
  await requireSession();
  await prisma.task.update({
    where: { id },
    data: { status, returnReason: null },
  });
  await syncTaskSideEffects(id, status);
  revalidatePath("/tasks");
}

/** Save external links on a task. */
export async function updateTaskLinks(id: string, links: { label: string; url: string }[]) {
  await requireSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.task.update as any)({
    where: { id },
    data: { externalLinks: JSON.stringify(links) },
  });
  revalidatePath("/tasks");
}

/** Owner submits the task for review, optionally specifying reviewer user IDs and a deadline. */
export async function submitTaskForReview(
  id: string,
  reviewerIds: string[] = [],
  newDueDate?: string,
) {
  const session = await requireSession();

  // Fetch full task content for the notification
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullTask = await (prisma.task.findUnique as any)({
    where: { id },
    select: {
      title: true,
      description: true,
      publisherId: true,
      externalLinks: true,
      dueDate: true,
      customer: { select: { brandName: true } },
    },
  });

  const task = await prisma.task.update({
    where: { id },
    data: {
      status: "REVIEW",
      ...(newDueDate ? { dueDate: new Date(newDueDate) } : {}),
    },
  });

  // Fetch attachments for rich notification content
  const attachments = await prisma.attachment.findMany({
    where: { entityType: "TASK", entityId: id },
    select: { fileName: true },
  });

  // Parse external links
  let links: { label: string; url: string }[] = [];
  try { links = JSON.parse(fullTask?.externalLinks ?? "[]"); } catch { /* ignore */ }

  // Build rich notification content
  const parts: string[] = [];
  if (fullTask?.customer?.brandName) parts.push(`关联品牌：${fullTask.customer.brandName}`);
  if (fullTask?.description?.trim()) parts.push(`任务描述：\n${fullTask.description.trim()}`);
  if (attachments.length > 0) {
    parts.push(`附件（${attachments.length}个）：\n${attachments.map(a => `• ${a.fileName}`).join("\n")}`);
  }
  if (links.length > 0) {
    parts.push(`外部链接：\n${links.map(l => `• ${l.label ? `${l.label}: ` : ""}${l.url}`).join("\n")}`);
  }
  const reviewDeadline = newDueDate || (fullTask?.dueDate ? new Date(fullTask.dueDate).toLocaleDateString("zh") : null);
  if (reviewDeadline) parts.push(`审核截止：${reviewDeadline}`);
  parts.push("请前往任务管理进行审核。");
  const content = parts.join("\n\n");

  // Notify reviewers + original publisher
  const notifyIds = new Set<string>(reviewerIds);
  if (task.publisherId && task.publisherId !== session.userId) {
    notifyIds.add(task.publisherId);
  }

  for (const targetId of notifyIds) {
    await prisma.reminder.create({
      data: {
        title: `任务待审核：${task.title}`,
        content,
        remindDate: new Date(),
        type: "REVIEW",
        targetId,
        createdById: session.userId,
      },
    });
  }
  revalidatePath("/tasks");
}

/** Owner returns the task to its publisher with a reason. */
export async function returnTask(id: string, reason: string) {
  const session = await requireSession();
  const task = await prisma.task.update({
    where: { id },
    data: { status: "RETURNED", returnReason: reason.trim() || null },
  });
  if (task.publisherId) {
    await prisma.reminder.create({
      data: {
        title: `任务被退回：${task.title}`,
        content: `退回理由：${reason.trim() || "（未填写）"}`,
        remindDate: new Date(),
        type: "FOLLOWUP",
        targetId: task.publisherId,
        createdById: session.userId,
      },
    });
  }
  revalidatePath("/tasks");
}

/**
 * Meeting-booking task: owner fills time / mode / location / attendees.
 * Saves the structured info, marks the task done, and (in-system) pushes a
 * meeting reminder + invite to every attendee. Real Feishu/Google sync is a
 * follow-up integration — see lib/notify.ts.
 */
export async function submitMeetingInfo(
  taskId: string,
  data: {
    meetingTime: string;
    meetingMode: string;
    meetingLocation: string;
    attendees: string[];
  },
) {
  const session = await requireSession();
  if (!data.meetingTime) throw new Error("请填写会议时间");
  if (data.meetingMode === "OFFLINE" && !data.meetingLocation.trim()) {
    throw new Error("线下会议需填写会议地点");
  }
  if (data.attendees.length === 0) throw new Error("请选择至少一名参会人员");

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      meetingTime: new Date(data.meetingTime),
      meetingMode: data.meetingMode,
      meetingLocation:
        data.meetingMode === "OFFLINE" ? data.meetingLocation.trim() : null,
      attendees: JSON.stringify(data.attendees),
      status: "DONE",
    },
    include: { customer: true },
  });

  await sendMeetingInvite({
    taskTitle: task.title,
    customerName: task.customer?.brandName ?? null,
    meetingTime: new Date(data.meetingTime),
    meetingMode: data.meetingMode,
    meetingLocation: task.meetingLocation,
    attendeeIds: data.attendees,
    organizerId: session.userId,
  });

  revalidatePath("/tasks");
}

// Keep customer progress in sync with key task transitions.
async function syncTaskSideEffects(taskId: string, status: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task?.customerId) return;
  if (task.category === "DEMO_PLAN") {
    if (status === "DONE") {
      await bumpCustomerStatus(task.customerId, "DEMO_DONE");
    } else if (status === "IN_PROGRESS" || status === "TODO") {
      await bumpCustomerStatus(task.customerId, "DEMO_IN_PROGRESS");
    }
  }
}
