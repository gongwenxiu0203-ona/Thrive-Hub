"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { bumpCustomerStatus } from "@/lib/customer";
import { CONTRACT_REVIEW_FIELDS } from "@/lib/constants";

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
  await prisma.contract.delete({ where: { id } });
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
  await requireSession();
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) throw new Error("合同不存在");
  if (contract.status !== "SIGNING") {
    throw new Error("仅「合同签署中」状态可标记签署完成");
  }
  await prisma.contract.update({
    where: { id },
    data: { status: "COMPLETED" },
  });
  await bumpCustomerStatus(contract.customerId, "CONTRACT_SIGNED");

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  revalidatePath(`/customers/${contract.customerId}`);
}
