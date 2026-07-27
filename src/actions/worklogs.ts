"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";

export type WorkLogSaveResult = { ok: boolean; error?: string; workLogId?: string };

export interface BdProgressItem {
  affiliateId: string;
  affiliateName: string;
  progress: string;
}

export interface WorkLogPayload {
  period: "WEEKLY" | "MONTHLY";
  projectIds: string[];   // 关联项目
  workTypes: string[];    // 项目管理 | BD
  content: string;        // 项目管理工作进度
  bdProgress?: BdProgressItem[]; // BD 工作进度（按联盟商）
}

/** 校验工作内容与对应进度是否填写 */
function validateWorkContent(payload: WorkLogPayload): string | null {
  if (!payload.workTypes.length) return "请选择工作内容（项目管理 / BD）";
  if (payload.workTypes.includes("项目管理") && !payload.content.trim()) {
    return "已选「项目管理」，请填写项目管理工作进度";
  }
  if (payload.workTypes.includes("BD")) {
    const valid = (payload.bdProgress ?? []).filter((b) => b.affiliateName && b.progress.trim());
    if (valid.length === 0) return "已选「BD」，请至少选择一个联盟商并填写进度";
  }
  return null;
}

async function validateActiveReferences(payload: WorkLogPayload): Promise<string | null> {
  const projectIds = [...new Set(payload.projectIds.filter(Boolean))];
  if (projectIds.length) {
    const activeProjectCount = await prisma.project.count({
      where: { id: { in: projectIds }, deletedAt: null },
    });
    if (activeProjectCount !== projectIds.length) return "所选项目中包含已删除或不存在的项目";
  }

  const affiliateIds = [...new Set(
    (payload.bdProgress ?? []).map((item) => item.affiliateId).filter(Boolean),
  )];
  if (affiliateIds.length) {
    const activeAffiliateCount = await prisma.affiliate.count({
      where: { id: { in: affiliateIds }, deletedAt: null },
    });
    if (activeAffiliateCount !== affiliateIds.length) return "所选联盟商中包含已删除或不存在的联盟商";
  }
  return null;
}

/** 创建工作日志（日志时间自动生成）*/
export async function createWorkLog(payload: WorkLogPayload): Promise<WorkLogSaveResult> {
  const session = await requireSession();
  await requireFeaturePermission(session, "worklogs.records", "EDIT");
  const err = validateWorkContent(payload);
  if (err) return { ok: false, error: err };
  const referenceError = await validateActiveReferences(payload);
  if (referenceError) return { ok: false, error: referenceError };

  const bd = (payload.bdProgress ?? []).filter((b) => b.affiliateName && b.progress.trim());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = await (prisma.workLog.create as any)({
    data: {
      authorId: session.userId,
      period: payload.period,
      projectIds: JSON.stringify(payload.projectIds),
      workTypes: JSON.stringify(payload.workTypes),
      content: payload.content.trim(),
      bdProgress: payload.workTypes.includes("BD") ? JSON.stringify(bd) : null,
    },
  });
  await syncWorkLogToProjects(log.id, session.userId, payload, bd);
  revalidatePath("/worklogs");
  return { ok: true, workLogId: log.id };
}

/** 更新工作日志（仅作者或管理员）*/
export async function updateWorkLog(id: string, payload: WorkLogPayload): Promise<WorkLogSaveResult> {
  const session = await requireSession();
  await requireFeaturePermission(session, "worklogs.records", "EDIT");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = await (prisma.workLog.findUnique as any)({ where: { id } });
  if (!log) return { ok: false, error: "日志不存在" };
  if (log.authorId !== session.userId && session.role !== "ADMIN") {
    return { ok: false, error: "仅作者或管理员可编辑" };
  }
  const err = validateWorkContent(payload);
  if (err) return { ok: false, error: err };
  const referenceError = await validateActiveReferences(payload);
  if (referenceError) return { ok: false, error: referenceError };

  const bd = (payload.bdProgress ?? []).filter((b) => b.affiliateName && b.progress.trim());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.workLog.update as any)({
    where: { id },
    data: {
      period: payload.period,
      projectIds: JSON.stringify(payload.projectIds),
      workTypes: JSON.stringify(payload.workTypes),
      content: payload.content.trim(),
      bdProgress: payload.workTypes.includes("BD") ? JSON.stringify(bd) : null,
    },
  });
  await syncWorkLogToProjects(id, log.authorId, payload, bd);
  revalidatePath("/worklogs");
  return { ok: true, workLogId: id };
}

async function syncWorkLogToProjects(
  workLogId: string,
  authorId: string,
  payload: WorkLogPayload,
  bd: BdProgressItem[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.projectEntry.deleteMany as any)({ where: { fromWorkLogId: workLogId } });
  const projectIds = [...new Set(payload.projectIds.filter(Boolean))];
  if (!projectIds.length) return;

  const entries: {
    projectId: string;
    kind: "DAILY" | "BD";
    content: string;
    authorId: string;
    fromWorkLogId: string;
  }[] = [];

  if (payload.workTypes.includes("项目管理") && payload.content.trim()) {
    for (const projectId of projectIds) {
      entries.push({
        projectId,
        kind: "DAILY",
        content: payload.content.trim(),
        authorId,
        fromWorkLogId: workLogId,
      });
    }
  }

  if (payload.workTypes.includes("BD")) {
    for (const item of bd) {
      for (const projectId of projectIds) {
        entries.push({
          projectId,
          kind: "BD",
          content: `${item.affiliateName}：${item.progress.trim()}`,
          authorId,
          fromWorkLogId: workLogId,
        });
      }
    }
  }

  if (entries.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.projectEntry.createMany as any)({ data: entries });
  }
  for (const projectId of projectIds) revalidatePath(`/projects/${projectId}`);
}

/** 软删除（回收站 7 天可恢复；仅作者或管理员）*/
export async function softDeleteWorkLog(id: string) {
  const session = await requireSession();
  await requireFeaturePermission(session, "worklogs.records", "MANAGE");
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
  await requireFeaturePermission(session, "worklogs.records", "READ");
  if (!projectIds.length) return { ok: true, text: "", count: 0 };

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
