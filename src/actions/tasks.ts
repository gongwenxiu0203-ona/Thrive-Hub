"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { TASK_STATUS_ORDER } from "@/lib/constants";
import { bumpCustomerStatus } from "@/lib/customer";
import { sendMeetingInvite } from "@/lib/notify";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { writeAdminAudit } from "@/lib/adminObservability";
import type { SessionPayload } from "@/lib/auth";

const TASK_WRITE_STATUSES = new Set([
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
  "RETURNED",
  "CANCELLED",
]);

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

async function requireTaskEditor(): Promise<SessionPayload> {
  const session = await requireSession();
  if (
    session.status !== "APPROVED" ||
    (session.role !== "ADMIN" && session.role !== "USER")
  ) {
    throw new Error("无权修改任务");
  }
  await requireFeaturePermission(session, "tasks", "EDIT");
  return session;
}

async function requireTaskWriteAccess(taskId: string, session: SessionPayload) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      ...(session.role === "ADMIN"
        ? {}
        : { OR: [{ ownerId: session.userId }, { publisherId: session.userId }] }),
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      publisherId: true,
      customerId: true,
    },
  });
  if (!task) throw new Error("任务不存在或无权操作");
  return task;
}

async function requireApprovedInternalUsers(userIds: Array<string | null>) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const count = await prisma.user.count({
    where: {
      id: { in: ids },
      status: "APPROVED",
      role: { in: ["ADMIN", "USER"] },
    },
  });
  if (count !== ids.length) throw new Error("任务只能分配给已通过审核的内部员工");
}

async function requireActiveCustomer(customerId: string | null) {
  if (!customerId) return;
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new Error("所选客户不存在或已删除");
}

export async function createTask(fd: FormData) {
  const session = await requireTaskEditor();
  const title = str(fd, "title");
  if (!title) throw new Error("任务标题为必填项");

  const status = str(fd, "status") || "TODO";
  if (!TASK_WRITE_STATUSES.has(status)) throw new Error("无效的任务状态");
  const count = await prisma.task.count({ where: { status } });
  const dueDate = str(fd, "dueDate");
  const ownerId = str(fd, "ownerId") || null;
  const publisherId = str(fd, "publisherId") || session.userId;
  const customerId = str(fd, "customerId") || null;
  await requireApprovedInternalUsers([ownerId, publisherId]);
  await requireActiveCustomer(customerId);

  await prisma.task.create({
    data: {
      title,
      description: str(fd, "description") || null,
      customerId,
      ownerId,
      publisherId,
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
  const session = await requireTaskEditor();
  await requireTaskWriteAccess(id, session);
  const title = str(fd, "title");
  if (!title) throw new Error("任务标题为必填项");
  const dueDate = str(fd, "dueDate");
  const ownerId = str(fd, "ownerId") || null;
  const publisherId = str(fd, "publisherId") || null;
  const customerId = str(fd, "customerId") || null;
  await requireApprovedInternalUsers([ownerId, publisherId]);
  await requireActiveCustomer(customerId);

  await prisma.task.update({
    where: { id },
    data: {
      title,
      description: str(fd, "description") || null,
      customerId,
      ownerId,
      publisherId,
      priority: str(fd, "priority") || "MID",
      category: str(fd, "category") || "GENERAL",
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  revalidatePath("/tasks");
}

/** Reassign a task while preserving its publisher for progress tracking. */
export async function reassignTask(taskId: string, newOwnerId: string) {
  const session = await requireTaskEditor();
  const authorizedTask = await requireTaskWriteAccess(taskId, session);

  const newOwner = await prisma.user.findFirst({
      where: {
        id: newOwnerId,
        status: "APPROVED",
        role: { in: ["ADMIN", "USER"] },
      },
      select: { id: true, name: true },
    });

  if (!newOwner) throw new Error("只能转派给已通过审核的内部员工");
  const task = authorizedTask;
  if (task.ownerId === newOwner.id) return;

  const previousOwnerId = task.ownerId;
  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: { ownerId: newOwner.id },
    });
    await tx.reminder.create({
      data: {
        title: `收到转派任务：${task.title}`,
        content: "请前往任务管理查看任务要求并跟踪处理进度。",
        remindDate: new Date(),
        type: "FOLLOWUP",
        targetId: newOwner.id,
        createdById: session.userId,
      },
    });
  });

  await writeAdminAudit({
    actorId: session.userId,
    action: "REASSIGN",
    module: "TASK",
    targetType: "Task",
    targetId: task.id,
    targetLabel: task.title,
    summary: `转派任务给 ${newOwner.name}`,
    before: { ownerId: previousOwnerId },
    after: { ownerId: newOwner.id },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

/** Lightweight content edit from the task detail panel (title + description). */
export async function updateTaskContent(
  id: string,
  title: string,
  description: string,
) {
  const session = await requireTaskEditor();
  await requireTaskWriteAccess(id, session);
  if (!title.trim()) throw new Error("任务标题不能为空");
  await prisma.task.update({
    where: { id },
    data: { title: title.trim(), description: description.trim() || null },
  });
  revalidatePath("/tasks");
}

export async function deleteTask(id: string) {
  const session = await requireTaskEditor();
  await requireTaskWriteAccess(id, session);
  // 软删除：进回收站
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.task.update as any)({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tasks");
}

/** Kanban drag — move to a new column and persist that column's order. */
export async function moveTask(
  taskId: string,
  toStatus: string,
  orderedIds: string[],
) {
  const session = await requireTaskEditor();
  await requireTaskWriteAccess(taskId, session);
  if (!TASK_STATUS_ORDER.includes(toStatus)) {
    throw new Error("无效的任务状态");
  }
  const uniqueOrderedIds = [...new Set(orderedIds)];
  if (uniqueOrderedIds.length > 0 && session.role !== "ADMIN") {
    const allowedCount = await prisma.task.count({
      where: {
        id: { in: uniqueOrderedIds },
        deletedAt: null,
        OR: [{ ownerId: session.userId }, { publisherId: session.userId }],
      },
    });
    if (allowedCount !== uniqueOrderedIds.length) {
      throw new Error("排序列表包含无权操作的任务");
    }
  }
  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { status: toStatus } }),
    ...uniqueOrderedIds.map((id, index) =>
      prisma.task.update({ where: { id }, data: { sortOrder: index } }),
    ),
  ]);
  await syncTaskSideEffects(taskId, toStatus);
  revalidatePath("/tasks");
}

/** Plain status change used by the detail-panel action buttons. */
export async function setTaskStatus(id: string, status: string) {
  const session = await requireTaskEditor();
  await requireTaskWriteAccess(id, session);
  if (!TASK_WRITE_STATUSES.has(status)) throw new Error("无效的任务状态");
  await prisma.task.update({
    where: { id },
    data: { status, returnReason: null },
  });
  await syncTaskSideEffects(id, status);
  revalidatePath("/tasks");
}

/** Save external links on a task. */
export async function updateTaskLinks(id: string, links: { label: string; url: string }[]) {
  const session = await requireTaskEditor();
  await requireTaskWriteAccess(id, session);
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
  const session = await requireTaskEditor();
  await requireTaskWriteAccess(id, session);
  await requireApprovedInternalUsers(reviewerIds);

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
  const session = await requireTaskEditor();
  await requireTaskWriteAccess(id, session);
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
  const session = await requireTaskEditor();
  await requireTaskWriteAccess(taskId, session);
  await requireApprovedInternalUsers(data.attendees);
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
