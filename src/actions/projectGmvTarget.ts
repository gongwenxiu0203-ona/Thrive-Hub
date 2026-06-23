"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/dataScope";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface ChannelInput {
  id?: string;        // 已存在的渠道行 id（保留对应行）；缺省则视为新行
  channelName: string;
  ownerId?: string | null;
  role?: string;
  currency?: string;
  sharePercent: number;
  sortOrder?: number;
}

export interface ProjectGmvTargetInput {
  projectId: string;
  month: string;       // "YYYY-MM"
  amOwnerId?: string | null;
  amRole?: string;
  currency: string;    // USD | GBP | EUR | RMB
  monthlyTarget: number;
  remark?: string | null;
  channels: ChannelInput[];
}

/** Resolve default amOwner: Customer.backendOwnerId of the project's customer.
 *  Used when caller doesn't pass amOwnerId. */
async function defaultAmOwner(projectId: string): Promise<string | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { customer: { select: { backendOwnerId: true } } },
  });
  return p?.customer?.backendOwnerId ?? null;
}

/** Upsert the (projectId, month) target row + replace its channel rows in one
 *  transaction. Idempotent: calling again with the same month replaces the
 *  whole set. */
export async function setProjectGmvTarget(
  payload: ProjectGmvTargetInput,
): Promise<Result<{ targetId: string }>> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权设置项目 GMV 目标" };

  const { projectId, month, currency, monthlyTarget, channels } = payload;
  if (!projectId) return { ok: false, error: "缺少项目 id" };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "月份格式必须是 YYYY-MM" };
  if (monthlyTarget < 0) return { ok: false, error: "月度 GMV 目标不能为负数" };

  const amOwnerId =
    payload.amOwnerId === undefined ? await defaultAmOwner(projectId) : payload.amOwnerId;

  try {
    const targetId = await prisma.$transaction(async (tx) => {
      const target = await tx.projectGmvTarget.upsert({
        where: { projectId_month: { projectId, month } },
        create: {
          projectId,
          month,
          amOwnerId,
          amRole: payload.amRole ?? "AM",
          currency,
          monthlyTarget,
          remark: payload.remark ?? null,
          createdById: session.userId,
        },
        update: {
          amOwnerId,
          amRole: payload.amRole ?? "AM",
          currency,
          monthlyTarget,
          remark: payload.remark ?? null,
        },
        select: { id: true },
      });

      // 渠道行：策略最简 — 全部删除然后重建。第一期满足需求即可。
      await tx.projectChannelTarget.deleteMany({
        where: { projectGmvTargetId: target.id },
      });
      if (channels.length > 0) {
        await tx.projectChannelTarget.createMany({
          data: channels.map((c, idx) => ({
            projectGmvTargetId: target.id,
            channelName: c.channelName.trim() || `渠道${idx + 1}`,
            ownerId: c.ownerId ?? null,
            role: c.role ?? "PGM",
            currency: c.currency ?? currency,
            sharePercent: Number.isFinite(c.sharePercent) ? c.sharePercent : 0,
            sortOrder: c.sortOrder ?? idx,
          })),
        });
      }
      return target.id;
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/operations");
    revalidatePath("/dashboard");
    return { ok: true, data: { targetId } };
  } catch (e) {
    console.error("[setProjectGmvTarget]", e);
    return { ok: false, error: "保存失败，请重试" };
  }
}

/** Delete a single (projectId, month) target row + cascade channels. */
export async function deleteProjectGmvTarget(targetId: string): Promise<Result> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权删除项目 GMV 目标" };
  const row = await prisma.projectGmvTarget.findUnique({
    where: { id: targetId },
    select: { projectId: true },
  });
  if (!row) return { ok: false, error: "目标不存在" };
  await prisma.projectGmvTarget.delete({ where: { id: targetId } });
  revalidatePath(`/projects/${row.projectId}`);
  revalidatePath("/operations");
  return { ok: true };
}

