"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { contractScope } from "@/lib/dataScope";

type Result = { ok: true } | { ok: false; error: string };

async function access(contractId: string) {
  const session = await requireSession();
  await requireFeaturePermission(session, "contracts.records", "EDIT");
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, contractMode: "FRAMEWORK", deletedAt: null, ...contractScope(session, "all") },
    select: { id: true, contractNo: true, status: true, reviewerId: true },
  });
  if (!contract) throw new Error("主格式合同不存在或无权操作");
  return { session, contract };
}

function refresh(contractId: string) {
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/contracts/${contractId}/confirmations`);
  revalidatePath("/contracts");
  revalidatePath("/contracts/reviews");
}

export async function submitFrameworkForReview(contractId: string): Promise<Result> {
  try {
    const { session, contract } = await access(contractId);
    if (!["DRAFT", "REJECTED"].includes(contract.status)) return { ok: false, error: "只有草稿或审核退回的合同可以提交审核" };
    if (!contract.reviewerId) return { ok: false, error: "请先在主合同资料中选择审核人" };
    const confirmationCount = await prisma.contractProjectConfirmation.count({ where: { contractId } });
    if (!confirmationCount) return { ok: false, error: "请先至少保存一份项目确认书，再提交审核" };
    await prisma.$transaction(async (tx) => {
      const latest = await tx.contractReview.findFirst({ where: { contractId }, orderBy: { round: "desc" }, select: { round: true } });
      const review = await tx.contractReview.create({ data: { contractId, round: (latest?.round ?? 0) + 1, reviewerId: contract.reviewerId!, status: "PENDING" } });
      const changed = await tx.contract.updateMany({ where: { id: contractId, status: contract.status }, data: { status: "REVIEWING" } });
      if (changed.count !== 1) throw new Error("合同状态已变化，请刷新后重试");
      await tx.financeAuditLog.create({ data: { entityType: "CONTRACT", entityId: contractId, action: "SUBMIT_REVIEW", fromStatus: contract.status, toStatus: "REVIEWING", actorId: session.userId, note: `提交第 ${review.round} 轮审核`, metadata: JSON.stringify({ reviewId: review.id, reviewerId: contract.reviewerId }) } });
    });
    refresh(contractId);
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "提交审核失败" }; }
}

export async function skipFrameworkReview(contractId: string): Promise<Result> {
  try {
    const { session, contract } = await access(contractId);
    if (!["DRAFT", "REJECTED"].includes(contract.status)) return { ok: false, error: "当前状态不能跳过审核" };
    await prisma.$transaction(async (tx) => {
      const changed = await tx.contract.updateMany({ where: { id: contractId, status: contract.status }, data: { status: "SIGNING" } });
      if (changed.count !== 1) throw new Error("合同状态已变化，请刷新后重试");
      await tx.financeAuditLog.create({ data: { entityType: "CONTRACT", entityId: contractId, action: "SKIP_REVIEW", fromStatus: contract.status, toStatus: "SIGNING", actorId: session.userId, note: "跳过审核并进入导出签署阶段" } });
    });
    refresh(contractId);
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "跳过审核失败" }; }
}

export async function decideFrameworkReview(contractId: string, decision: "APPROVE" | "REJECT", comment: string): Promise<Result> {
  try {
    const { session, contract } = await access(contractId);
    if (contract.status !== "REVIEWING") return { ok: false, error: "当前合同不在审核中" };
    const review = await prisma.contractReview.findFirst({ where: { contractId, status: "PENDING" }, orderBy: { round: "desc" } });
    if (!review) return { ok: false, error: "未找到待处理审核轮次" };
    if (review.reviewerId !== session.userId && session.role !== "ADMIN") return { ok: false, error: "仅指定审核人或管理员可以处理" };
    const note = comment.trim();
    if (decision === "REJECT" && !note) return { ok: false, error: "退回审核时必须填写原因" };
    const nextStatus = decision === "APPROVE" ? "SIGNING" : "REJECTED";
    await prisma.$transaction(async (tx) => {
      await tx.contractReview.update({ where: { id: review.id }, data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED" } });
      await tx.contract.update({ where: { id: contractId }, data: { status: nextStatus, reviewComment: note || null } });
      await tx.financeAuditLog.create({ data: { entityType: "CONTRACT", entityId: contractId, action: decision === "APPROVE" ? "APPROVE_REVIEW" : "REJECT_REVIEW", fromStatus: "REVIEWING", toStatus: nextStatus, actorId: session.userId, note: note || `第 ${review.round} 轮审核通过`, metadata: JSON.stringify({ reviewId: review.id, round: review.round }) } });
    });
    refresh(contractId);
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "审核处理失败" }; }
}
