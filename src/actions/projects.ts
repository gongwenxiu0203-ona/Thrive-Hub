"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";

export type ProjectSaveResult = { ok: boolean; error?: string; projectId?: string };

/**
 * 整合合作：选关联客户（可多项目）+ 关联合同（可选）创建项目。
 * 商务负责人自动取客户负责人；项目负责人默认创建人（可手动改）。
 */
export async function createIntegratedProject(payload: {
  customerId: string;
  contractId?: string;
  ownerId?: string;
  name?: string;
}): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权创建项目" };
  if (!payload.customerId) return { ok: false, error: "请选择关联客户" };

  const customer = await prisma.customer.findUnique({ where: { id: payload.customerId } });
  if (!customer) return { ok: false, error: "客户不存在" };

  // 关联合同（可选）：若选了，校验属于该客户
  let contractNo = "";
  let contractStatus = "";
  if (payload.contractId) {
    const contract = await prisma.contract.findUnique({ where: { id: payload.contractId } });
    if (!contract) return { ok: false, error: "合同不存在" };
    if (contract.customerId !== payload.customerId) {
      return { ok: false, error: "所选合同不属于该客户" };
    }
    contractNo = contract.contractNo;
    contractStatus = contract.status;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.project.create as any)({
    data: {
      type: "INTEGRATED",
      name: payload.name?.trim() || `${customer.brandName} 整合合作`,
      customerId: payload.customerId,
      contractId: payload.contractId || null,
      ownerId: payload.ownerId || session.userId, // 默认创建人
      createdById: session.userId,
    },
  });

  // 关联了合同：把当前合同进度作为一条「合同进度」节点写入时间流
  if (payload.contractId) {
    const { CONTRACT_STATUS_LABELS } = await import("@/lib/constants");
    const label = CONTRACT_STATUS_LABELS[contractStatus] ?? contractStatus;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.projectEntry.create as any)({
      data: {
        projectId: project.id,
        kind: "CONTRACT",
        content: `关联合同 ${contractNo}，当前状态：${label}`,
        authorId: session.userId,
      },
    });
  }

  revalidatePath("/projects");
  return { ok: true, projectId: project.id };
}

/** 合同状态变动时，同步一条「合同进度」节点到关联的整合合作项目时间流 */
export async function syncContractProgressToProjects(contractId: string, statusLabel: string, note?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = await (prisma.project.findMany as any)({
    where: { contractId, deletedAt: null },
    select: { id: true },
  });
  for (const p of projects as { id: string }[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.projectEntry.create as any)({
      data: {
        projectId: p.id,
        kind: "CONTRACT",
        content: note ? `合同进度：${statusLabel}（${note}）` : `合同进度：${statusLabel}`,
        authorId: null,
      },
    });
    revalidatePath(`/projects/${p.id}`);
  }
}

/** 添加项目时间流条目（日常工作 / 数据维度 / BD 进度）*/
export async function addProjectEntry(
  projectId: string,
  content: string,
  kind: "DAILY" | "DATA" | "BD" = "DAILY",
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
    where: { projectIds: { contains: projectId }, deletedAt: null },
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

// ═══════════════════════════════════════════════════════════════════════════
// 单次合作流程（P3）
// 阶段：REQUIREMENT 需求创建 → SUBMITTED 已提交 → PRICE_CONFIRMED 确认价格
//      → INFO_SUBMITTED 已提交合作信息 → DECIDED 确认是否合作 → SETTLED 已结算
// ═══════════════════════════════════════════════════════════════════════════

/** 给项目时间流追加一条流程节点（NODE），记录提交人 */
async function addNode(projectId: string, authorId: string, content: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.projectEntry.create as any)({
    data: { projectId, kind: "NODE", content, authorId },
  });
}

/** 创建单次合作项目（需求创建 + 上传合作信息）*/
export async function createOneOffProject(payload: {
  name: string;
  customerId?: string;
  demand: string;
  coopInfo?: string;
}): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权创建项目" };
  if (!payload.name.trim()) return { ok: false, error: "请填写项目名称" };
  if (!payload.demand.trim()) return { ok: false, error: "请填写需求描述" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.project.create as any)({
    data: {
      type: "ONE_OFF",
      name: payload.name.trim(),
      customerId: payload.customerId || null,
      demand: payload.demand.trim(),
      coopInfo: payload.coopInfo?.trim() || null,
      stage: "REQUIREMENT",
      createdById: session.userId,
    },
  });
  await addNode(project.id, session.userId, `创建需求：${payload.demand.trim().slice(0, 100)}`);
  revalidatePath("/projects");
  return { ok: true, projectId: project.id };
}

/** 提交给站内用户（站内提醒通知；邮件暂不实现）*/
export async function submitProjectTo(projectId: string, toUserId: string): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  if (!toUserId) return { ok: false, error: "请选择提交对象" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.project.findUnique as any)({ where: { id: projectId } });
  if (!project) return { ok: false, error: "项目不存在" };

  const [toUser, fromUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: toUserId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.project.update as any)({
    where: { id: projectId },
    data: { submittedToId: toUserId, stage: "SUBMITTED" },
  });
  // 站内提醒通知
  await prisma.reminder.create({
    data: {
      title: `单次合作项目待处理：${project.name}`,
      content: `${fromUser?.name ?? "同事"} 提交了单次合作项目「${project.name}」给你处理，请确认价格。`,
      remindDate: new Date(),
      type: "FOLLOWUP",
      targetId: toUserId,
      createdById: session.userId,
    },
  });
  await addNode(projectId, session.userId, `提交给 ${toUser?.name ?? "成员"} 处理（已站内通知）`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
}

/** 确认价格 */
export async function confirmProjectPrice(projectId: string, price: string): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  if (!price.trim()) return { ok: false, error: "请填写确认价格" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.project.update as any)({
    where: { id: projectId },
    data: { price: price.trim(), stage: "PRICE_CONFIRMED" },
  });
  await addNode(projectId, session.userId, `确认价格：${price.trim()}`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
}

/** 提交合作信息（最低折后价 + ASIN 库存表 + 是否设置 code + 起止时间）*/
export async function submitProjectInfo(
  projectId: string,
  data: {
    lowestPrice?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asins: any[];
    hasCode: boolean; code?: string; startDate?: string; endDate?: string;
  },
): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  if (!data.lowestPrice?.trim()) return { ok: false, error: "请填写最低折后价" };
  if (data.hasCode && !data.code?.trim()) return { ok: false, error: "已选择设置 code，请填写 code 码" };
  if (data.hasCode && (!data.startDate || !data.endDate)) return { ok: false, error: "请填写 code 起止时间" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.project.update as any)({
    where: { id: projectId },
    data: { submissionData: JSON.stringify(data), stage: "INFO_SUBMITTED" },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asinCount = (data.asins ?? []).filter((a: any) => a.parentAsin || a.childAsin).length;
  const codeNote = data.hasCode ? `，code：${data.code}（${data.startDate} ~ ${data.endDate}）` : "，未设置 code";
  await addNode(projectId, session.userId, `提交合作信息：最低折后价 ${data.lowestPrice}，${asinCount} 行 ASIN 库存${codeNote}`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
}

/** 上传合作信息表格（识别表头作为推广基本信息展示字段）*/
export async function uploadCoopInfoTable(
  projectId: string,
  data: { headers: string[]; rows: string[][] },
): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  if (!data.headers.length) return { ok: false, error: "未识别到表格表头" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.project.update as any)({
    where: { id: projectId },
    data: { coopInfo: JSON.stringify(data) },
  });
  await addNode(projectId, session.userId, `上传合作信息表：${data.headers.length} 个字段，${data.rows.length} 行数据`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
}

/** 生成邮件发联盟商（暂不真发，仅在时间流记录「已发送邮件」并推进阶段）*/
export async function sendAffiliateEmailStep(
  projectId: string,
  data: { affiliateName: string; senderEmail?: string; receiverEmail?: string },
): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  if (!data.affiliateName) return { ok: false, error: "请选择联盟商" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.project.update as any)({
    where: { id: projectId },
    data: { stage: "EMAIL_SENT" },
  });
  const recv = data.receiverEmail ? ` → ${data.receiverEmail}` : "";
  await addNode(projectId, session.userId, `已发送邮件给联盟商「${data.affiliateName}」${recv}（按模板生成）`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
}

/** 沟通备注（时间流追加一条沟通记录）*/
export async function addProjectNote(projectId: string, note: string): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  if (!note.trim()) return { ok: false, error: "请填写沟通内容" };
  await addNode(projectId, session.userId, `沟通：${note.trim()}`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
}

/** 确认是否合作 */
export async function decideProjectCoop(projectId: string, result: "COOPERATE" | "DECLINED"): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.project.update as any)({
    where: { id: projectId },
    data: { coopResult: result, stage: "DECIDED", status: result === "DECLINED" ? "CANCELLED" : "ACTIVE" },
  });
  await addNode(projectId, session.userId, result === "COOPERATE" ? "确认合作 ✓" : "确认不合作 ✗");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
}

/** 保存结算数据（人员 / 父ASIN / 服务费金额）+ 标记已结算 */
export async function settleProject(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: { person: string; parentAsin: string; serviceFee: string }[],
): Promise<ProjectSaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  const valid = rows.filter((r) => r.person || r.parentAsin || r.serviceFee);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.project.update as any)({
    where: { id: projectId },
    data: { settlementData: JSON.stringify(valid), stage: "SETTLED", status: "DONE" },
  });
  await addNode(projectId, session.userId, `完成结算：${valid.length} 条结算记录`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
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
