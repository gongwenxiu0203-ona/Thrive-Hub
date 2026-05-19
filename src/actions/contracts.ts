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
    type: str(fd, "type") || "CHANNEL",
    contractText: str(fd, "contractText") || null,
    extractedBy: str(fd, "extractedBy") || null,
    partyA: str(fd, "partyA") || null,
    accountingPeriod: str(fd, "accountingPeriod") || null,
    feeCycle: str(fd, "feeCycle") || null,
    feeAmount: str(fd, "feeAmount") || null,
    commissionRate: str(fd, "commissionRate") || null,
    affiliateRule: str(fd, "affiliateRule") || null,
    paymentCycle: str(fd, "paymentCycle") || null,
    invoiceReq: str(fd, "invoiceReq") || null,
    lateLiability: str(fd, "lateLiability") || null,
    remark: str(fd, "remark") || null,
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
  await requireSession();
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) throw new Error("合同不存在");
  if (contract.status !== "IN_PROGRESS") {
    throw new Error("仅「合同推进中」状态可提交审核");
  }

  // Ensure a review row exists for every field, defaulting to APPROVED.
  for (const field of CONTRACT_REVIEW_FIELDS) {
    await prisma.contractFieldReview.upsert({
      where: {
        contractId_fieldName: { contractId: id, fieldName: field.key },
      },
      create: {
        contractId: id,
        fieldName: field.key,
        decision: "APPROVED",
        reviewerId: contract.reviewerId,
      },
      update: {},
    });
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

  await prisma.contract.update({
    where: { id: contractId },
    data: { status: hasRejected ? "IN_PROGRESS" : "SIGNING" },
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
