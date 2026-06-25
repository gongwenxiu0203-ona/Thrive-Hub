"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { bumpCustomerStatus } from "@/lib/customer";
import {
  commissionConfigFromLegacy,
  normalizeTemplateKey,
  primaryRateFromCommissionConfig,
} from "@/lib/contractCommissionConfig";
import { CONTRACT_REVIEW_FIELDS } from "@/lib/constants";
import { syncContractProgressToProjects } from "@/actions/projects";
import { ensureReconciliationForContract } from "@/actions/channelSplit";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
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

/** Return the next available contract number for the given prefix (LYNQ | THRAIVE). */
export async function nextContractNo(prefix: "LYNQ" | "THRAIVE"): Promise<string> {
  await requireSession();
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
  const session = await requireSession();
  const contractNo = str(fd, "contractNo");
  const customerId = str(fd, "customerId");
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

  // Linking a contract advances the customer's progress.
  await bumpCustomerStatus(customerId, "CONTRACT_IN_PROGRESS");

  revalidatePath("/contracts");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, contractId: contract.id };
}

export async function updateContract(
  id: string,
  fd: FormData,
): Promise<ContractSaveResult> {
  await requireSession();
  const contractNo = str(fd, "contractNo");
  const customerId = str(fd, "customerId");
  if (!contractNo) return { ok: false, error: "合同编号为必填项" };
  if (!customerId) return { ok: false, error: "请选择关联客户" };

  const dup = await prisma.contract.findFirst({
    where: { contractNo, NOT: { id } },
  });
  if (dup) return { ok: false, error: "合同编号已存在" };

  await prisma.contract.update({
    where: { id },
    data: {
      contractNo,
      customerId,
      ...contractFieldsFromForm(fd),
      ownerId: str(fd, "ownerId") || null,
      reviewerId: str(fd, "reviewerId") || null,
    },
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return { ok: true, contractId: id };
}

export async function deleteContract(id: string) {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("仅管理员可删除合同");
  // 软删除：进回收站，7 天内可恢复
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.contract.update as any)({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/contracts");
  redirect("/contracts");
}

/** 合同推进中 → 合同审核中. Seeds the per-field review rows + notifies reviewer. */
export async function submitForReview(id: string) {
  const session = await requireSession();
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
  const session = await requireSession();
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
  const session = await requireSession();
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
  const session = await requireSession();
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
  const session = await requireSession();
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
  await bumpCustomerStatus(contract.customerId, "CONTRACT_SIGNED");

  // Auto-create channel reconciliation for customers with a channel user.
  // If the customer has a ChannelSplitRule configured, generates rule-driven
  // periods; otherwise falls back to a single stub record.
  const customer = await prisma.customer.findUnique({
    where: { id: contract.customerId },
    select: { channelUserId: true },
  });
  if (customer?.channelUserId) {
    await ensureReconciliationForContract({
      contractId: id,
      customerId: contract.customerId,
      channelUserId: customer.channelUserId,
      createdById: session.userId,
    });
  }

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  revalidatePath(`/customers/${contract.customerId}`);
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
  const session = await requireSession();
  const { customerId, partyAName } = payload;
  if (!customerId) return { ok: false, error: "请选择关联客户" };
  // 链接模式草稿：甲方信息由客户填写，允许暂时为空
  const isExternalDraft = payload.fillMethod === "EXTERNAL_LINK";
  const requiresTemplate = !payload.saveAsDraft && !isExternalDraft;
  if (!partyAName && !isExternalDraft) return { ok: false, error: "甲方公司名称为必填项" };
  if (requiresTemplate && !payload.templateId) return { ok: false, error: "请选择适用的合同模板" };
  const selectedTemplate = payload.templateId
    ? await prisma.contractTemplate.findUnique({
      where: { id: payload.templateId },
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

  if (!payload.saveAsDraft) {
    await bumpCustomerStatus(customerId, "CONTRACT_IN_PROGRESS");
  }
  revalidatePath("/contracts");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, contractId: contract.id };
}

export async function updateContractV4(
  id: string,
  payload: Partial<ContractV4Payload>,
): Promise<ContractSaveResult> {
  await requireSession();
  let templateKey = payload.commissionType;
  if (payload.templateId) {
    const selectedTemplate = await prisma.contractTemplate.findUnique({
      where: { id: payload.templateId },
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
  await (prisma.contract.update as any)({
    where: { id },
    data: {
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
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return { ok: true, contractId: id };
}

/** 生成外部填写 token，有效期 7 天 */
export async function generateFillToken(contractId: string): Promise<{ token: string }> {
  await requireSession();
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
