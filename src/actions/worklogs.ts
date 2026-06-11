"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";

export type WorkLogSaveResult = { ok: boolean; error?: string; workLogId?: string };

export interface WorkLogPayload {
  period: "WEEKLY" | "MONTHLY";
  projectIds: string[];   // 关联项目
  workTypes: string[];    // 项目管理 | BD
  content: string;        // 具体工作进度
}

/** 创建工作日志（日志时间自动生成）*/
export async function createWorkLog(payload: WorkLogPayload): Promise<WorkLogSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  if (!payload.content.trim()) return { ok: false, error: "请填写具体工作进度" };
  if (!payload.workTypes.length) return { ok: false, error: "请选择工作内容（项目管理 / BD）" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = await (prisma.workLog.create as any)({
    data: {
      authorId: session.userId,
      period: payload.period,
      projectIds: JSON.stringify(payload.projectIds),
      workTypes: JSON.stringify(payload.workTypes),
      content: payload.content.trim(),
    },
  });
  revalidatePath("/worklogs");
  return { ok: true, workLogId: log.id };
}

/** 更新工作日志（仅作者或管理员）*/
export async function updateWorkLog(id: string, payload: WorkLogPayload): Promise<WorkLogSaveResult> {
  const session = await requireSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = await (prisma.workLog.findUnique as any)({ where: { id } });
  if (!log) return { ok: false, error: "日志不存在" };
  if (log.authorId !== session.userId && session.role !== "ADMIN") {
    return { ok: false, error: "仅作者或管理员可编辑" };
  }
  if (!payload.content.trim()) return { ok: false, error: "请填写具体工作进度" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.workLog.update as any)({
    where: { id },
    data: {
      period: payload.period,
      projectIds: JSON.stringify(payload.projectIds),
      workTypes: JSON.stringify(payload.workTypes),
      content: payload.content.trim(),
    },
  });
  revalidatePath("/worklogs");
  return { ok: true, workLogId: id };
}

/** 软删除（回收站 7 天可恢复；仅作者或管理员）*/
export async function softDeleteWorkLog(id: string) {
  const session = await requireSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = await (prisma.workLog.findUnique as any)({ where: { id } });
  if (!log) throw new Error("日志不存在");
  if (log.authorId !== session.userId && session.role !== "ADMIN") {
    throw new Error("仅作者或管理员可删除");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.workLog.update as any)({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/worklogs");
  revalidatePath("/recycle-bin");
}

/**
 * 从项目拉取对应周期内的工作进度（用于填充日志）。
 * 周期窗口：周报 = 近 7 天；月报 = 近 30 天。
 */
export async function fetchProjectProgress(
  projectIds: string[],
  period: "WEEKLY" | "MONTHLY",
): Promise<{ ok: boolean; text: string; count: number }> {
  const session = await requireSession();
  if (!isStaff(session.role) || !projectIds.length) return { ok: true, text: "", count: 0 };

  const days = period === "MONTHLY" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = await (prisma.projectEntry.findMany as any)({
    where: {
      projectId: { in: projectIds },
      createdAt: { gte: since },
      fromWorkLogId: null, // 不回拉「从日志导入」的条目，避免循环
    },
    include: {
      project: { select: { name: true } },
      author: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = (entries as any[]).map((e) => {
    const d = new Date(e.createdAt);
    const date = `${d.getMonth() + 1}/${d.getDate()}`;
    return `[${e.project?.name ?? "项目"} · ${date} · ${e.author?.name ?? ""}] ${e.content}`;
  });

  return { ok: true, text: lines.join("\n"), count: lines.length };
}
