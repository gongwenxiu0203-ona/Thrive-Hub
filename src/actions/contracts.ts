"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";
import { bumpCustomerStatus } from "@/lib/customer";
import {
  commissionConfigFromLegacy,
  normalizeTemplateKey,
  primaryRateFromCommissionConfig,
} from "@/lib/contractCommissionConfig";
import { CONTRACT_REVIEW_FIELDS } from "@/lib/constants";
import { syncContractProgressToProjects } from "@/actions/projects";
import { contractScope, creationReferenceCustomerScope } from "@/lib/dataScope";
import type { PermLevel } from "@/lib/featurePermissions";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { writeAdminAudit } from "@/lib/adminObservability";
import { ensureCustomerReconciliationPlan } from "@/lib/customerReconciliationPlan";

const CONTRACT_EDIT_AUDIT_SELECT = {
  id: true,
  contractNo: true,
  status: true,
  customerId: true,
  type: true,
  ownerId: true,
  reviewerId: true,
  partyA: true,
  partyACreditCode: true,
  partyAAddress: true,
  partyAContact: true,
  partyAPhone: true,
  partyAEmail: true,
  promoPlatform: true,
  targetSite: true,
  startDate: true,
  endDate: true,
  feeAmount: true,
  feeCurrency: true,
  feeCycle: true,
  commissionType: true,
  commissionRate: true,
  commissionConfig: true,
  templateId: true,
  partyBCompany: true,
} as const;

async function auditCompletedContractEdit(
  actorId: string,
  before: Record<string, unknown>,
) {
  const after = await prisma.contract.findUnique({
    where: { id: String(before.id) },
    select: CONTRACT_EDIT_AUDIT_SELECT,
  });
  if (!after) return;

  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as unknown as Record<string, unknown>;
  const changedFields = Object.keys(afterRecord).filter(
    (key) => JSON.stringify(beforeRecord[key]) !== JSON.stringify(afterRecord[key]),
  );
  if (changedFields.length === 0) return;

  await writeAdminAudit({
    actorId,
    action: "UPDATE_COMPLETED_CONTRACT",
    module: "contracts",
    targetType: "Contract",
    targetId: after.id,
    targetLabel: after.contractNo,
    summary: `管理员修改已签署合同：${after.contractNo}`,
    before: beforeRecord,
    after: afterRecord,
    metadata: {
      changedFields,
      ...(changedFields.includes("customerId") ? { oldCustomerNeedsManualReview: true } : {}),
    },
  });
}

async function requireContractsPermission(required: PermLevel) {
  const session = await requireSession();
  await requireFeaturePermission(session, "contracts.records", required);
  return session;
}

async function requireContractRow(id: string, required: PermLevel) {
  const session = await requireContractsPermission(required);
  const row = await prisma.contract.findFirst({
    where: { id, ...contractScope(session, session.role === "ADMIN" ? "all" : "mine"), deletedAt: null },
    select: { id: true },
  });
  if (!row) throw new Error("合同不存在或无权访问");
  return session;
}

async function requireCustomerRow(customerId: string, session: Awaited<ReturnType<typeof requireSession>>) {
  const row = await prisma.customer.findFirst({
    where: { id: customerId, ...creationReferenceCustomerScope(session), deletedAt: null },
    select: { id: true },
  });
  if (!row) throw new Error("客户不存在或无权访问");
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function normalizedBusinessNumber(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

async function requireApprovedInternalOwner(ownerId: string) {
  const owner = await prisma.user.findFirst({
    where: { id: ownerId, status: "APPROVED", role: { in: ["ADMIN", "USER", "LYNQ_STAFF"] } },
    select: { id: true },
  });
  if (!owner) throw new Error("合同负责人必须是已审核的内部员工");
}

// Resolve the default reviewer ("Shallow"), falling back gracefully.
async function defaultReviewerId(): Promise<string | null> {
  const shallow = await prisma.user.findFirst({
    where: {
      OR: [
        { email: "shallow@demo.com" },
        { name: { contains: "Shallow" } },
        { name: { contains: "shallow" } },
      ],
    },
  });
  return shallow?.id ?? null;
}

function contractFieldsFromForm(fd: FormData) {
  return {
    type: str(fd, "type") || "BRAND",
    contractText: str(fd, "contractText") || null,
    extractedBy: str(fd, "extractedBy") || null,
    // 基本信息
    partyA: str(fd, "partyA") || null,
    // 推广信息
    promoPlatform: str(fd, "promoPlatform") || null,
    targetSite: str(fd, "targetSite") || null,
    // 月度服务费
    feeAmount: str(fd, "feeAmount") || null,
    feeCurrency: str(fd, "feeCurrency") || null,
    paymentMethod: str(fd, "paymentMethod") || null,
    // 联盟归因 GMV 佣金
    commissionType: str(fd, "commissionType") || "FIXED",
    commissionRate: str(fd, "commissionRate") || null,
    thresholdAmount: str(fd, "thresholdAmount") || null,
    thresholdCurrency: str(fd, "thresholdCurrency") || null,
    tieredRules: str(fd, "tieredRules") || null,
    excessBaseMonths: str(fd, "excessBaseMonths") || null,
    excessCommissionRate: str(fd, "excessCommissionRate") || null,
    gmvSettlementCycle: str(fd, "gmvSettlementCycle") || null,
    // 合作期限
    fileUrl: str(fd, "fileUrl") || null,
    startDate: str(fd, "startDate") ? new Date(str(fd, "startDate")) : null,
    endDate: str(fd, "endDate") ? new Date(str(fd, "endDate")) : null,
  };
}

export type ContractSaveResult = {
  ok: boolean;
  error?: string;
  contractId?: string;
};

async function nextContractNoByPrefix(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await prisma.contract.findMany({
    where: { contractNo: { startsWith: `${prefix}-${year}-` } },
    select: { contractNo: true },
  });
  let max = 0;
  for (const { contractNo } of existing) {
    const seq = parseInt(contractNo.split("-").pop() ?? "0", 10);
    if (!isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

/** Return the next available contract number for the given prefix (LYNQ | THRAIVE). */
export async function nextContractNo(prefix: "LYNQ" | "THRAIVE"): Promise<string> {
  await requireContractsPermission("EDIT");
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  // Find the highest sequence number used this year for this prefix.
  const existing = await prisma.contract.findMany({
    where: { contractNo: { startsWith: `${prefix}-${year}-` } },
    select: { contractNo: true },
  });
  let max = 0;
  for (const { contractNo } of existing) {
    const seq = parseInt(contractNo.split("-").pop() ?? "0", 10);
    if (!isNaN(seq) && seq > max) max = seq;
  }
  void like; // suppress unused warning
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

export async function createContract(
  fd: FormData,
): Promise<ContractSaveResult> {
  const session = await requireContractsPermission("EDIT");
  const contractNo = str(fd, "contractNo");
  const customerId = str(fd, "customerId");
  if (customerId) await requireCustomerRow(customerId, session);
  if (!contractNo) return { ok: false, error: "合同编号为必填项" };
  if (!customerId) return { ok: false, error: "请选择关联客户" };

  const dup = await prisma.contract.findUnique({ where: { contractNo } });
  if (dup) return { ok: false, error: "合同编号已存在" };

  const ownerId = str(fd, "ownerId") || session.userId;
  const reviewerId = str(fd, "reviewerId") || (await defaultReviewerId());

  const contract = await prisma.contract.create({
    data: {
      contractNo,
      customerId,
      ...contractFieldsFromForm(fd),
      ownerId,
      reviewerId,
      status: "IN_PROGRESS",
      createdById: session.userId,
    },
  });

  revalidatePath("/contracts");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, contractId: contract.id };
}

export async function updateContract(
  id: string,
  fd: FormData,
): Promise<ContractSaveResult> {
  const session = await requireContractRow(id, "EDIT");
  const existing = await prisma.contract.findUnique({
    where: { id },
    select: CONTRACT_EDIT_AUDIT_SELECT,
  });
  if (!existing) return { ok: false, error: "合同不存在" };
  if (existing.status === "COMPLETED" && session.role !== "ADMIN") {
    return { ok: false, error: "已签署完成的合同仅管理员可以修改，请联系管理员" };
  }
  const contractNo = str(fd, "contractNo");
  const customerId = str(fd, "customerId");
  if (customerId) await requireCustomerRow(customerId, session);
  if (!contractNo) return { ok: false, error: "合同编号为必填项" };
  if (!customerId) return { ok: false, error: "请选择关联客户" };
  if (contractNo !== existing.contractNo) {
    return { ok: false, error: "合同编号只能由管理员在合同详情页单独修改，并填写修改原因" };
  }

  const dup = await prisma.contract.findFirst({
    where: { contractNo, NOT: { id } },
  });
  if (dup) return { ok: false, error: "合同编号已存在" };

  const customerChanged = customerId !== existing.customerId;
  const customerDependencyPrefix = "该合同已关联下游数据，不能直接修改客户";
  try {
    await prisma.$transaction(async (tx) => {
      if (customerChanged) {
        const [projectCount, reconciliationCount, channelReconciliationCount] = await Promise.all([
          tx.project.count({ where: { contractId: id } }),
          tx.customerReconciliation.count({ where: { contractId: id } }),
          tx.channelReconciliation.count({ where: { contractId: id } }),
        ]);
        if (projectCount > 0 || reconciliationCount > 0 || channelReconciliationCount > 0) {
          throw new Error(
            `${customerDependencyPrefix}（项目 ${projectCount} 条、客户对账 ${reconciliationCount} 条、渠道对账 ${channelReconciliationCount} 条）。请先处理关联记录。`,
          );
        }
      }
      await tx.contract.update({
        where: { id },
        data: {
          contractNo,
          customerId,
          ...(customerChanged ? { externalFillToken: null, externalFillExpiry: null } : {}),
          ...contractFieldsFromForm(fd),
          ownerId: str(fd, "ownerId") || null,
          reviewerId: str(fd, "reviewerId") || null,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(customerDependencyPrefix)) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  if (existing.status === "COMPLETED") {
    await auditCompletedContractEdit(session.userId, existing as unknown as Record<string, unknown>);
    if (customerChanged) await bumpCustomerStatus(customerId, "COOPERATING");
  } else if (customerChanged) {
    await writeAdminAudit({
      actorId: session.userId,
      action: "UPDATE_CONTRACT_CUSTOMER",
      module: "contracts",
      targetType: "Contract",
      targetId: id,
      targetLabel: contractNo,
      summary: `修改合同关联客户：${contractNo}；原客户状态需人工复核`,
      before: { customerId: existing.customerId },
      after: { customerId },
      metadata: { oldCustomerNeedsManualReview: true },
    });
  }

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  if (existing.customerId) revalidatePath(`/customers/${existing.customerId}`);
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, contractId: id };
}

export async function deleteContract(id: string) {
  const session = await requireContractRow(id, "MANAGE");
  if (session.role !== "ADMIN") throw new Error("仅管理员可删除合同");
  const contract = await prisma.contract.findUnique({
    where: { id },
    select: { id: true, contractNo: true, customerId: true },
  });
  if (!contract) throw new Error("合同不存在");
  const now = new Date();
  const reason = `合同 ${contract.contractNo} 已删除，未完成的后续业务停止`;
  const result = await prisma.$transaction(async (tx) => {
    await tx.contract.update({ where: { id }, data: { deletedAt: now } });
    const cancelledReconciliations = await tx.customerReconciliation.updateMany({
      where: { contractId: id, deletedAt: null, status: { not: "CONFIRMED" }, planStatus: { not: "CANCELLED" } },
      data: { planStatus: "CANCELLED", adjustmentReason: reason, updatedAt: now },
    });
    const cancelledTasks = await tx.task.updateMany({
      where: { contractId: id, deletedAt: null, status: { notIn: ["DONE", "CANCELLED"] } },
      data: { status: "CANCELLED", returnReason: reason, updatedAt: now },
    });
    const emptyChannelRecords = await tx.channelReconciliation.findMany({
      where: { contractId: id, deletedAt: null, status: "PENDING", periods: { none: {} } },
      select: { id: true, auditLog: true, status: true },
    });
    for (const channelRecord of emptyChannelRecords) {
      await tx.channelReconciliation.update({
        where: { id: channelRecord.id },
        data: {
          deletedAt: now,
          deletedById: session.userId,
          deletionReason: reason,
          auditLog: JSON.stringify([
            ...(() => { try { return JSON.parse(channelRecord.auditLog); } catch { return []; } })(),
            { type: "CONTRACT_DELETE_SOFT_DELETE", actorId: session.userId, at: now.toISOString(), reason },
          ]),
        },
      });
    }
    return {
      cancelledReconciliations: cancelledReconciliations.count,
      cancelledTasks: cancelledTasks.count,
      emptyChannelRecords: emptyChannelRecords.length,
    };
  });
  await writeAdminAudit({
    actorId: session.userId,
    action: "DELETE_CONTRACT_WITH_SAFE_LINKAGE",
    module: "contracts",
    targetType: "Contract",
    targetId: id,
    targetLabel: contract.contractNo,
    summary: `软删除合同 ${contract.contractNo}；取消未完成对账和任务，保留已确认财务历史`,
    before: { deletedAt: null },
    after: { deletedAt: now },
    metadata: result,
  });
  revalidatePath("/contracts");
  revalidatePath("/finance");
  if (contract.customerId) revalidatePath(`/customers/${contract.customerId}`);
  redirect("/contracts");
}

/** 合同推进中 → 合同审核中. Seeds the per-field review rows + notifies reviewer. */
export async function submitForReview(id: string) {
  const session = await requireContractRow(id, "EDIT");
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { fieldReviews: true },
  });
  if (!contract) throw new Error("合同不存在");
  if (contract.status !== "IN_PROGRESS") {
    throw new Error("仅「合同推进中」状态可提交审核");
  }

  // On re-submission: reset previously REJECTED fields to APPROVED so reviewer
  // can evaluate them again. APPROVED fields remain locked (persisted in lockedFields).
  const existingByField = new Map(contract.fieldReviews.map((r) => [r.fieldName, r]));
  for (const field of CONTRACT_REVIEW_FIELDS) {
    const existing = existingByField.get(field.key);
    if (existing) {
      // Only reset REJECTED ones — APPROVED fields stay as-is (locked for reviewer)
      if (existing.decision === "REJECTED") {
        await prisma.contractFieldReview.update({
          where: { contractId_fieldName: { contractId: id, fieldName: field.key } },
          data: { decision: "APPROVED", modification: null },
        });
      }
    } else {
      await prisma.contractFieldReview.create({
        data: {
          contractId: id,
          fieldName: field.key,
          decision: "APPROVED",
          reviewerId: contract.reviewerId,
        },
      });
    }
  }

  await prisma.contract.update({
    where: { id },
    data: { status: "REVIEWING" },
  });
  await syncContractProgressToProjects(id, "审核中");

  if (contract.reviewerId) {
    await prisma.reminder.create({
      data: {
        title: `合同待审核：${contract.contractNo}`,
        content: "有一份合同已提交审核，请前往合同管理进行字段级审核。",
        remindDate: new Date(),
        type: "REVIEW",
        targetId: contract.reviewerId,
        createdById: contract.createdById,
      },
    });

    // Create a CONTRACT_REVIEW task for the reviewer (skip if one already exists).
    const existingTask = await prisma.task.findFirst({
      where: { contractId: id, category: "CONTRACT_REVIEW", status: { not: "DONE" } },
    });
    if (!existingTask) {
      await prisma.task.create({
        data: {
          title: `审核合同 ${contract.contractNo}`,
          category: "CONTRACT_REVIEW",
          status: "TODO",
          ownerId: contract.reviewerId,
          publisherId: session.userId,
          contractId: contract.id,
          priority: "HIGH",
        },
      });
    } else {
      // Reset the task to TODO on re-submission
      await prisma.task.update({
        where: { id: existingTask.id },
        data: { status: "TODO" },
      });
    }
  }

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
}

/** Reviewer records 通过/驳回 + 修改意见 for one field. */
export async function reviewField(
  contractId: string,
  fieldName: string,
  decision: string,
  modification: string,
) {
  const session = await requireContractRow(contractId, "EDIT");
  if (session.role !== "ADMIN") throw new Error("仅管理员可审核合同");

  await prisma.contractFieldReview.upsert({
    where: { contractId_fieldName: { contractId, fieldName } },
    create: {
      contractId,
      fieldName,
      decision,
      modification: modification.trim() || null,
      reviewerId: session.userId,
    },
    update: {
      decision,
      modification: modification.trim() || null,
      reviewerId: session.userId,
    },
  });
  revalidatePath(`/contracts/${contractId}`);
}

/** Finish review: any 驳回 → 退回「合同推进中」修改; 全部通过 → 合同签署中. */
export async function finalizeReview(contractId: string) {
  const session = await requireContractRow(contractId, "EDIT");
  if (session.role !== "ADMIN") throw new Error("仅管理员可审核合同");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
  });
  if (!contract) throw new Error("合同不存在");
  if (contract.status !== "REVIEWING") {
    throw new Error("仅「合同审核中」状态可完成审核");
  }

  const reviews = await prisma.contractFieldReview.findMany({
    where: { contractId },
  });
  const hasRejected = reviews.some((r) => r.decision === "REJECTED");

  // When rejecting: lock the currently-APPROVED fields so they can't be re-reviewed
  const newLockedFields = hasRejected
    ? reviews.filter((r) => r.decision === "APPROVED").map((r) => r.fieldName)
    : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.contract.update as any)({
    where: { id: contractId },
    data: {
      status: hasRejected ? "IN_PROGRESS" : "SIGNING",
      lockedFields: JSON.stringify(newLockedFields),
    },
  });
  await syncContractProgressToProjects(contractId, hasRejected ? "审核驳回·推进中" : "签署中");

  // Mark the review task as DONE
  await prisma.task.updateMany({
    where: { contractId, category: "CONTRACT_REVIEW", status: { not: "DONE" } },
    data: { status: "DONE" },
  });

  // Notify the contract owner of the outcome.
  if (contract.ownerId) {
    await prisma.reminder.create({
      data: {
        title: hasRejected
          ? `合同被驳回：${contract.contractNo}`
          : `合同审核通过：${contract.contractNo}`,
        content: hasRejected
          ? "部分字段被驳回，请根据修改意见调整后重新提交审核。"
          : "合同已通过审核，进入「合同签署中」，签署完成后请标记。",
        remindDate: new Date(),
        type: "REVIEW",
        targetId: contract.ownerId,
        createdById: session.userId,
      },
    });
  }

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contractId}`);
}

/** Save overall reviewer comment on a contract. */
export async function saveReviewComment(contractId: string, comment: string) {
  const session = await requireContractRow(contractId, "EDIT");
  if (session.role !== "ADMIN") throw new Error("仅管理员可填写审核意见");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.contract.update as any)({
    where: { id: contractId },
    data: { reviewComment: comment.trim() || null },
  });
  revalidatePath(`/contracts/${contractId}`);
}

/** 合同签署中 → 合同签署完成. Advances the linked customer to 合同签署完成. */
export async function markCompleted(id: string) {
  const session = await requireContractRow(id, "MANAGE");
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) throw new Error("合同不存在");
  if (contract.status !== "SIGNING") {
    throw new Error("仅「合同签署中」状态可标记签署完成");
  }
  await prisma.contract.update({
    where: { id },
    data: { status: "COMPLETED" },
  });
  await syncContractProgressToProjects(id, "签署完成");
  if (contract.customerId) {
    await bumpCustomerStatus(contract.customerId, "COOPERATING");
  }
  await ensureCustomerReconciliationPlan(id, session.userId);

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  if (contract.customerId) {
    revalidatePath(`/customers/${contract.customerId}`);
  }
  revalidatePath("/finance");
}

// ─── V4 合同表单（新版甲方项目确认书）────────────────────────────────────────

export interface ContractV4Payload {
  customerId: string;
  ownerId?: string;
  reviewerId?: string;
  type?: string;  // BRAND | CHANNEL | REBATE
  // 甲方信息
  partyAName: string;
  partyACreditCode?: string;
  partyAAddress?: string;
  partyAContact?: string;
  partyAPhone?: string;
  partyAEmail?: string;
  // 合作信息
  promoPlatform?: string;
  targetSite?: string;        // comma-separated
  startDate?: string;
  endDate?: string;
  taxType?: string;
  taxBearer?: string;
  // 费用
  feeAmount?: string;
  feeCurrency?: string;
  firstPeriodFee?: number;
  feeCycle?: string;
  // GMV 佣金
  commissionType?: string;
  commissionRate?: string;
  thresholdAmount?: string;
  thresholdCurrency?: string;
  thresholdReachedRate?: string;
  thresholdUnreachedRate?: string;
  tieredRules?: string;
  excessBaseMonths?: string;
  excessCommissionRate?: string;
  gmvSettlementCycle?: string;
  commissionConfig?: string;
  // 推广信息
  productList?: string;     // JSON string
  coopChannels?: string;    // JSON string
  // 填写方式
  fillMethod?: string;
  // 草稿支持：传 "DRAFT" 创建为草稿；不传或其他值走默认 IN_PROGRESS
  saveAsDraft?: boolean;
  // 模板 + 乙方信息（P1/P2）
  templateId?: string;
  partyBCompany?: string;             // "THRAIVE" | "LINGYUE"
  partyBBankAccounts?: string;        // JSON array of bank keys
  specialCommissionTerms?: string;
}

export async function uploadTransactionalContract(
  fd: FormData,
): Promise<ContractSaveResult> {
  const session = await requireContractsPermission("EDIT");
  const file = fd.get("file");
  const ownerId = str(fd, "ownerId") || session.userId;
  const type = str(fd, "type") || "TRANSACTIONAL";

  if (type !== "TRANSACTIONAL") {
    return { ok: false, error: "事务性合同类型无效" };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "请上传事务性合同文件" };
  }

  const saved = await saveUploadedFile(file);
  await requireApprovedInternalOwner(ownerId);
  const contractNo = await nextContractNoByPrefix("COMPANY");
  const contract = await prisma.contract.create({
    data: {
      contractNo,
      customerId: null,
      type: "TRANSACTIONAL",
      status: "COMPLETED",
      ownerId,
      reviewerId: null,
      createdById: session.userId,
      fileUrl: saved.fileUrl,
      generatedDocUrl: saved.fileUrl,
      fillMethod: "TRANSACTIONAL_UPLOAD",
      uploadType: "TRANSACTIONAL",
      uploadArchiveMode: "SIGNED_ARCHIVE",
      extractedBy: null,
    },
  });
  await prisma.attachment.create({
    data: {
      fileName: saved.fileName,
      fileUrl: saved.fileUrl,
      fileSize: saved.fileSize,
      entityType: "CONTRACT",
      entityId: contract.id,
      uploadedById: session.userId,
    },
  });

  revalidatePath("/contracts");
  return { ok: true, contractId: contract.id };
}

export async function uploadChannelContract(fd: FormData): Promise<ContractSaveResult> {
  try {
    const session = await requireContractsPermission("EDIT");
    const customerId = str(fd, "customerId");
    const ownerId = str(fd, "ownerId") || session.userId;
    const file = fd.get("file");
    if (!customerId) return { ok: false, error: "请选择关联客户" };
    if (!(file instanceof File)) return { ok: false, error: "请上传渠道商合同文件" };
    await requireCustomerRow(customerId, session);
    await requireApprovedInternalOwner(ownerId);
    const saved = await saveUploadedFile(file);
    let contract: { id: string } | null = null;
    for (let attempt = 0; attempt < 4 && !contract; attempt++) {
      try {
        const contractNo = await nextContractNoByPrefix("CHANNEL");
        contract = await prisma.$transaction(async (tx) => {
          const created = await tx.contract.create({
            data: {
              contractNo,
              customerId,
              type: "CHANNEL",
              status: "COMPLETED",
              ownerId,
              createdById: session.userId,
              fileUrl: saved.fileUrl,
              generatedDocUrl: saved.fileUrl,
              fillMethod: "CHANNEL_ARCHIVE_UPLOAD",
              uploadType: "CHANNEL_ARCHIVE",
              uploadArchiveMode: "SIGNED_ARCHIVE",
            },
            select: { id: true },
          });
          await tx.attachment.create({ data: {
            fileName: saved.fileName, fileUrl: saved.fileUrl, fileSize: saved.fileSize,
            entityType: "CONTRACT", entityId: created.id, uploadedById: session.userId,
          } });
          return created;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
    if (!contract) return { ok: false, error: "渠道商合同编号生成冲突，请重试" };
    await bumpCustomerStatus(customerId, "COOPERATING");
    await ensureCustomerReconciliationPlan(contract.id, session.userId);
    revalidatePath("/contracts");
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/finance");
    return { ok: true, contractId: contract.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "上传失败" };
  }
}

export async function updateContractNumber(
  contractId: string,
  nextNumberInput: string,
  reasonInput: string,
): Promise<ContractSaveResult> {
  try {
    const session = await requireContractRow(contractId, "MANAGE");
    if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可修改合同编号" };
    const nextNumber = normalizedBusinessNumber(nextNumberInput);
    const reason = reasonInput.trim();
    if (!nextNumber) return { ok: false, error: "请输入新合同编号" };
    if (reason.length < 2) return { ok: false, error: "请填写完整的修改原因" };
    const existing = await prisma.contract.findUnique({ where: { id: contractId }, select: { contractNo: true } });
    if (!existing) return { ok: false, error: "合同不存在" };
    if (existing.contractNo === nextNumber) return { ok: false, error: "新编号与当前编号相同" };
    const duplicate = await prisma.contract.findUnique({ where: { contractNo: nextNumber }, select: { id: true } });
    if (duplicate) return { ok: false, error: "该合同编号已存在，不能重复" };
    try {
      await prisma.contract.update({ where: { id: contractId }, data: { contractNo: nextNumber } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: false, error: "该合同编号已存在，不能重复" };
      }
      throw error;
    }
    await writeAdminAudit({
      actorId: session.userId, action: "CHANGE_CONTRACT_NUMBER", module: "contracts",
      targetType: "Contract", targetId: contractId, targetLabel: nextNumber,
      summary: `管理员修改合同编号：${existing.contractNo} → ${nextNumber}`,
      before: { contractNo: existing.contractNo }, after: { contractNo: nextNumber }, metadata: { reason },
    });
    revalidatePath("/contracts");
    revalidatePath(`/contracts/${contractId}`);
    return { ok: true, contractId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "修改失败" };
  }
}

export async function addContractAddendum(fd: FormData): Promise<ContractSaveResult> {
  try {
    const contractId = str(fd, "contractId");
    const session = await requireContractRow(contractId, "EDIT");
    const title = str(fd, "title");
    const terms = str(fd, "terms");
    const effectiveAtText = str(fd, "effectiveAt");
    const file = fd.get("file");
    if (!title) return { ok: false, error: "请填写附加条款标题" };
    if (!terms && !(file instanceof File)) return { ok: false, error: "请填写条款内容或上传补充合同文件" };
    const saved = file instanceof File && file.size > 0 ? await saveUploadedFile(file) : null;
    await prisma.$transaction(async (tx) => {
      const addendum = await tx.contractAddendum.create({ data: {
        contractId, title, terms: terms || null,
        effectiveAt: effectiveAtText ? new Date(effectiveAtText) : null,
        fileName: saved?.fileName ?? null, fileUrl: saved?.fileUrl ?? null, fileSize: saved?.fileSize ?? null,
        uploadedById: session.userId,
      } });
      if (saved) await tx.attachment.create({ data: {
        fileName: saved.fileName, fileUrl: saved.fileUrl, fileSize: saved.fileSize,
        entityType: "CONTRACT_ADDENDUM", entityId: addendum.id, uploadedById: session.userId,
      } });
    });
    await writeAdminAudit({
      actorId: session.userId, action: "ADD_CONTRACT_ADDENDUM", module: "contracts",
      targetType: "Contract", targetId: contractId, summary: `追加合同附加条款：${title}`,
      metadata: { title, hasTerms: Boolean(terms), hasFile: Boolean(saved) },
    });
    revalidatePath(`/contracts/${contractId}`);
    return { ok: true, contractId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "保存失败" };
  }
}

/** Resolve fixed Party B identity fields based on the selected company key.
 *  Returns an object that can be spread into prisma.contract.create/update data.
 *  No DB hit — all values are constants in src/lib/partyB.ts. */
function resolvePartyB(companyKey: string | null | undefined) {
  if (companyKey !== "THRAIVE" && companyKey !== "LINGYUE") {
    return {
      partyBCompany: null,
      partyBCreditCode: null,
      partyBLegalRep: null,
      partyBAddress: null,
      partyBContact: null,
      partyBPhone: null,
      partyBEmail: null,
    };
  }
  // Inline constants (avoid client/lib import in server action keeps bundle clean)
  const map = {
    THRAIVE: {
      partyBCompany: "THRAIVE",
      partyBCreditCode: "80456388",
      partyBLegalRep: null,
      partyBAddress: "RM 29-33 5/F BEVERLEY COMMCTR 87-105 CHATHAM RD TSIMSHA TSUIHONG KONG",
      partyBContact: "胡铭",
      partyBPhone: "18721724179",
      partyBEmail: "ledo.h@thraiveagency.com",
    },
    LINGYUE: {
      partyBCompany: "LINGYUE",
      partyBCreditCode: "91440606MAEMCQTB37",
      partyBLegalRep: null, // 灵跃无 法定代表人 字段
      partyBAddress: "佛山市顺德区大良街道北区新桂北路192号铺",
      partyBContact: "胡铭",
      partyBPhone: "18721724179",
      partyBEmail: "ledo.h@thraiveagency.com",
    },
  } as const;
  return map[companyKey];
}

export async function createContractV4(
  payload: ContractV4Payload,
): Promise<ContractSaveResult> {
  const session = await requireContractsPermission("EDIT");
  const { customerId, partyAName } = payload;
  if (customerId) await requireCustomerRow(customerId, session);
  if (!customerId) return { ok: false, error: "请选择关联客户" };
  // 链接模式草稿：甲方信息由客户填写，允许暂时为空
  const isExternalDraft = payload.fillMethod === "EXTERNAL_LINK";
  const requiresTemplate = !payload.saveAsDraft && !isExternalDraft;
  if (!partyAName && !isExternalDraft) return { ok: false, error: "甲方公司名称为必填项" };
  if (requiresTemplate && !payload.templateId) return { ok: false, error: "请选择适用的合同模板" };
  const selectedTemplate = payload.templateId
    ? await prisma.contractTemplate.findFirst({
      where: { id: payload.templateId, deletedAt: null },
      select: { templateKey: true },
    })
    : null;
  if (payload.templateId && !selectedTemplate) return { ok: false, error: "合同模板不存在或已删除" };
  const templateKey = normalizeTemplateKey(selectedTemplate?.templateKey ?? payload.commissionType ?? "FIXED");
  const commissionConfig = commissionConfigFromLegacy({
    ...payload,
    templateKey,
  });
  const primaryCommissionRate = primaryRateFromCommissionConfig(commissionConfig);

  // contractNo 并发冲突重试（P2002）：findMany + max + 1 不是原子的。
  const year = new Date().getFullYear();
  const computeNextNo = async () => {
    const existing = await prisma.contract.findMany({
      where: { contractNo: { startsWith: `THRAIVE-${year}-` } },
      select: { contractNo: true },
    });
    let max = 0;
    for (const { contractNo } of existing) {
      const seq = parseInt(contractNo.split("-").pop() ?? "0", 10);
      if (!isNaN(seq) && seq > max) max = seq;
    }
    return `THRAIVE-${year}-${String(max + 1).padStart(3, "0")}`;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let contract: any = null;
  let lastNoConflictError: unknown = null;
  for (let attempt = 0; attempt < 3 && !contract; attempt++) {
    const contractNo = await computeNextNo();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contract = await (prisma.contract.create as any)({
        data: {
          contractNo,
          customerId,
      type: payload.type || "BRAND",
      status: payload.saveAsDraft ? "DRAFT" : "IN_PROGRESS",
      createdById: session.userId,
      ownerId: payload.ownerId || session.userId,
      reviewerId: payload.reviewerId || (await defaultReviewerId()),
      fillMethod: payload.fillMethod ?? "MANUAL",
      // 甲方信息
      partyA: partyAName,
      partyACreditCode: payload.partyACreditCode || null,
      partyALegalRep: null,
      partyAAddress: payload.partyAAddress || null,
      partyAContact: payload.partyAContact || null,
      partyAPhone: payload.partyAPhone || null,
      partyAEmail: payload.partyAEmail || null,
      // 合作信息
      promoPlatform: payload.promoPlatform || null,
      targetSite: payload.targetSite || null,
      startDate: payload.startDate ? new Date(payload.startDate) : null,
      endDate: payload.endDate ? new Date(payload.endDate) : null,
      taxType: payload.taxType || "不含税",
      taxBearer: payload.taxBearer || "甲方",
      // 费用
      feeAmount: payload.feeAmount || null,
      feeCurrency: payload.feeCurrency || "人民币",
      firstPeriodFee: payload.firstPeriodFee ?? null,
      feeCycle: payload.feeCycle || "季度预付",
      // GMV 佣金
      commissionType: templateKey,
      commissionRate: primaryCommissionRate || payload.commissionRate || null,
      thresholdAmount: commissionConfig.threshold?.amount || payload.thresholdAmount || null,
      thresholdCurrency: commissionConfig.threshold?.currency || payload.thresholdCurrency || "USD",
      tieredRules: commissionConfig.tiered ? JSON.stringify(commissionConfig.tiered) : payload.tieredRules || null,
      excessBaseMonths: commissionConfig.incremental?.baseMonths || payload.excessBaseMonths || null,
      excessCommissionRate: commissionConfig.incremental?.excessRate || payload.excessCommissionRate || null,
      commissionConfig: JSON.stringify(commissionConfig),
      gmvSettlementCycle: payload.gmvSettlementCycle || "月度",
      // 推广信息
      productList: payload.productList || null,
      coopChannels: payload.coopChannels || null,
      // 模板 + 乙方信息（P1/P2）
      templateId: payload.templateId || null,
      ...resolvePartyB(payload.partyBCompany),
      partyBBankAccounts: payload.partyBBankAccounts ?? "[]",
      specialCommissionTerms: payload.specialCommissionTerms || null,
        },
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P2002") { lastNoConflictError = e; continue; }
      throw e;
    }
  }
  if (!contract) {
    console.warn("[createContractV4] contractNo conflict after 3 retries:", lastNoConflictError);
    return { ok: false, error: "合同编号冲突，请稍后重试" };
  }

  revalidatePath("/contracts");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, contractId: contract.id };
}

export async function updateContractV4(
  id: string,
  payload: Partial<ContractV4Payload>,
): Promise<ContractSaveResult> {
  const session = await requireContractRow(id, "EDIT");
  const existing = await prisma.contract.findUnique({
    where: { id },
    select: CONTRACT_EDIT_AUDIT_SELECT,
  });
  if (!existing) return { ok: false, error: "合同不存在" };
  if (existing.status === "COMPLETED" && session.role !== "ADMIN") {
    return { ok: false, error: "已签署完成的合同仅管理员可以修改，请联系管理员" };
  }
  const nextCustomerId = payload.customerId?.trim();
  if (!nextCustomerId) return { ok: false, error: "请选择关联客户" };
  await requireCustomerRow(nextCustomerId, session);

  const customerChanged = nextCustomerId !== existing.customerId;
  const customerDependencyPrefix = "该合同已关联下游数据，不能直接修改客户";
  let templateKey = payload.commissionType;
  if (payload.templateId) {
    const selectedTemplate = await prisma.contractTemplate.findFirst({
      where: { id: payload.templateId, deletedAt: null },
      select: { templateKey: true },
    });
    if (!selectedTemplate) return { ok: false, error: "合同模板不存在或已删除" };
    templateKey = selectedTemplate.templateKey;
  }
  const commissionConfig = commissionConfigFromLegacy({
    ...payload,
    templateKey,
  });
  const primaryCommissionRate = primaryRateFromCommissionConfig(commissionConfig);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try {
    await prisma.$transaction(async (tx) => {
      if (customerChanged) {
        const [projectCount, reconciliationCount, channelReconciliationCount] = await Promise.all([
          tx.project.count({ where: { contractId: id } }),
          tx.customerReconciliation.count({ where: { contractId: id } }),
          tx.channelReconciliation.count({ where: { contractId: id } }),
        ]);
        if (projectCount > 0 || reconciliationCount > 0 || channelReconciliationCount > 0) {
          throw new Error(
            `${customerDependencyPrefix}（项目 ${projectCount} 条、客户对账 ${reconciliationCount} 条、渠道对账 ${channelReconciliationCount} 条）。请先处理关联记录。`,
          );
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (tx.contract.update as any)({
        where: { id },
        data: {
      customerId: nextCustomerId,
      ...(customerChanged ? { externalFillToken: null, externalFillExpiry: null } : {}),
      partyA: payload.partyAName,
      partyACreditCode: payload.partyACreditCode ?? undefined,
      partyALegalRep: null,
      partyAAddress: payload.partyAAddress ?? undefined,
      partyAContact: payload.partyAContact ?? undefined,
      partyAPhone: payload.partyAPhone ?? undefined,
      partyAEmail: payload.partyAEmail ?? undefined,
      promoPlatform: payload.promoPlatform ?? undefined,
      targetSite: payload.targetSite ?? undefined,
      startDate: payload.startDate ? new Date(payload.startDate) : undefined,
      endDate: payload.endDate ? new Date(payload.endDate) : undefined,
      taxType: payload.taxType ?? undefined,
      taxBearer: payload.taxBearer ?? undefined,
      feeAmount: payload.feeAmount ?? undefined,
      feeCurrency: payload.feeCurrency ?? undefined,
      firstPeriodFee: payload.firstPeriodFee ?? undefined,
      feeCycle: payload.feeCycle ?? undefined,
      commissionType: payload.templateId ? normalizeTemplateKey(templateKey) : payload.commissionType ?? undefined,
      commissionRate: (primaryCommissionRate || payload.commissionRate) ?? undefined,
      thresholdAmount: commissionConfig.threshold?.amount ?? payload.thresholdAmount ?? undefined,
      thresholdCurrency: commissionConfig.threshold?.currency ?? payload.thresholdCurrency ?? undefined,
      tieredRules: commissionConfig.tiered ? JSON.stringify(commissionConfig.tiered) : payload.tieredRules ?? undefined,
      excessBaseMonths: commissionConfig.incremental?.baseMonths ?? payload.excessBaseMonths ?? undefined,
      excessCommissionRate: commissionConfig.incremental?.excessRate ?? payload.excessCommissionRate ?? undefined,
      commissionConfig: JSON.stringify(commissionConfig),
      gmvSettlementCycle: payload.gmvSettlementCycle ?? undefined,
      productList: payload.productList ?? undefined,
      coopChannels: payload.coopChannels ?? undefined,
      // 模板 + 乙方（P1/P2）
      templateId: payload.templateId ?? undefined,
      ...(payload.partyBCompany !== undefined ? resolvePartyB(payload.partyBCompany) : {}),
      partyBBankAccounts: payload.partyBBankAccounts ?? undefined,
      specialCommissionTerms: payload.specialCommissionTerms ?? undefined,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(customerDependencyPrefix)) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  if (existing.status === "COMPLETED") {
    await auditCompletedContractEdit(session.userId, existing as unknown as Record<string, unknown>);
    if (customerChanged) await bumpCustomerStatus(nextCustomerId, "COOPERATING");
  } else if (customerChanged) {
    await writeAdminAudit({
      actorId: session.userId,
      action: "UPDATE_CONTRACT_CUSTOMER",
      module: "contracts",
      targetType: "Contract",
      targetId: id,
      targetLabel: existing.contractNo,
      summary: `修改合同关联客户：${existing.contractNo}`,
      before: { customerId: existing.customerId },
      after: { customerId: nextCustomerId },
    });
  }
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  if (existing.customerId) revalidatePath(`/customers/${existing.customerId}`);
  revalidatePath(`/customers/${nextCustomerId}`);
  return { ok: true, contractId: id };
}

/** 生成外部填写 token，有效期 7 天 */
export async function generateFillToken(contractId: string): Promise<{ token: string }> {
  await requireContractRow(contractId, "EDIT");
  const token = crypto.randomUUID();
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.contract.update as any)({
    where: { id: contractId },
    data: { externalFillToken: token, externalFillExpiry: expiry, fillMethod: "EXTERNAL_LINK" },
  });
  revalidatePath(`/contracts/${contractId}`);
  return { token };
}
