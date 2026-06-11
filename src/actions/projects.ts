"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";

export type ProjectSaveResult = { ok: boolean; error?: string; projectId?: string };

/**
 * 整合合作：基于「签署完成」的合同创建项目。
 * 自动带出客户（含商务/后端负责人）。
 */
export async function createIntegratedProject(
  contractId: string,
  name?: string,
): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权创建项目" };
  if (!contractId) return { ok: false, error: "请选择签署完成的合同" };

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: true },
  });
  if (!contract) return { ok: false, error: "合同不存在" };
  if (contract.status !== "COMPLETED") {
    return { ok: false, error: "仅「签署完成」的合同可创建整合合作项目" };
  }

  // 同一合同避免重复建项目
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dup = await (prisma.project.findFirst as any)({
    where: { contractId, deletedAt: null },
  });
  if (dup) return { ok: false, error: "该合同已创建过项目" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.project.create as any)({
    data: {
      type: "INTEGRATED",
      name: name?.trim() || `${contract.customer.brandName} 整合合作`,
      customerId: contract.customerId,
      contractId,
      createdById: session.userId,
    },
  });

  revalidatePath("/projects");
  return { ok: true, projectId: project.id };
}

/** 添加项目时间流条目（日常工作 / 数据维度）*/
export async function addProjectEntry(
  projectId: string,
  content: string,
  kind: "DAILY" | "DATA" = "DAILY",
): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  const text = content.trim();
  if (!text) return { ok: false, error: "请填写进度内容" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.projectEntry.create as any)({
    data: { projectId, kind, content: text, authorId: session.userId },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
}

/** 从工作日志拉取本项目相关内容到时间流（去重：已拉取过的日志跳过）*/
export async function importWorkLogEntries(projectId: string): Promise<{ ok: boolean; imported: number; error?: string }> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, imported: 0, error: "无权操作" };

  // 找关联了本项目的工作日志
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = await (prisma.workLog.findMany as any)({
    where: { projectIds: { contains: projectId } },
    include: { author: { select: { name: true } } },
    orderBy: { logDate: "asc" },
  });
  if (!logs.length) return { ok: true, imported: 0 };

  // 已导入的日志 id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (prisma.projectEntry.findMany as any)({
    where: { projectId, fromWorkLogId: { not: null } },
    select: { fromWorkLogId: true },
  });
  const done = new Set(existing.map((e: { fromWorkLogId: string }) => e.fromWorkLogId));

  let imported = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const log of logs as any[]) {
    if (done.has(log.id)) continue;
    const periodLabel = log.period === "MONTHLY" ? "月报" : "周报";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.projectEntry.create as any)({
      data: {
        projectId,
        kind: "DAILY",
        content: `【${periodLabel} · ${log.author?.name ?? "未知"}】${log.content}`,
        authorId: log.authorId,
        fromWorkLogId: log.id,
        createdAt: log.logDate,
      },
    });
    imported++;
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, imported };
}

/** 更新项目状态 */
export async function updateProjectStatus(projectId: string, status: string) {
  const session = await requireSession();
  if (!isStaff(session.role)) throw new Error("无权操作");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.project.update as any)({
    where: { id: projectId },
    data: { status },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

/** 软删除项目（进回收站，7 天可恢复）*/
export async function softDeleteProject(projectId: string) {
  const session = await requireSession();
  if (!isStaff(session.role)) throw new Error("无权删除项目");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.project.update as any)({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/projects");
  revalidatePath("/recycle-bin");
}
