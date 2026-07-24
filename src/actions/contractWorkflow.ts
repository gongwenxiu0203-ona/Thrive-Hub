"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { fillContractTemplate } from "@/lib/contractTemplateFill";
import { buildPlaceholderMap } from "@/lib/contractPlaceholders";
import { contractFileBaseName } from "@/lib/contractFileName";
import { openReviewRound } from "@/actions/contractReview";
import { resolveContractTemplateBuffer } from "@/lib/contractTemplateResolve";
import { writePrivateContractFile } from "@/lib/contractFileStorage";
import { contractScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** Resolve current version count + return the next versionNo. */
async function nextVersionNo(contractId: string): Promise<number> {
  const last = await prisma.contractVersion.findFirst({
    where: { contractId },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  });
  return (last?.versionNo ?? 0) + 1;
}

/** Fill the contract's selected template with current field values, write the
 *  output as a new ContractVersion, and update contract.generatedDocUrl. */
export async function generateContractFromTemplate(
  contractId: string,
  reason: string = "首次生成"
): Promise<Result<{ versionNo: number; fileUrl: string }>> {
  const session = await requireSession();
  try {
    await requireFeaturePermission(session, "contracts.signing", "EDIT");
  } catch (error) {
    if (error instanceof FeaturePermissionError) return { ok: false, error: "无权编辑合同" };
    throw error;
  }

  const c = await prisma.contract.findFirst({
    where: { id: contractId, ...contractScope(session, session.role === "ADMIN" ? "all" : "mine") },
    include: { customer: { select: { brandName: true } }, template: true },
  });
  if (!c) return { ok: false, error: "合同不存在" };

  if (!c.templateId) return { ok: false, error: "请先在合同上选择适用的模板" };
  const tpl = await resolveContractTemplateBuffer(c.template);
  if ("error" in tpl) return { ok: false, error: tpl.error };

  const fields = { ...buildPlaceholderMap(c), templateKey: tpl.templateKey };
  const filled = await fillContractTemplate(tpl.buffer, fields);

  const versionNo = await nextVersionNo(contractId);
  const fileName = `${contractFileBaseName(c)}-v${versionNo}.docx`;
  const { fileUrl } = await writePrivateContractFile("contracts-generated", fileName, filled);

  await prisma.contractVersion.create({
    data: {
      contractId,
      versionNo,
      fileUrl,
      fileType: "docx",
      reason,
      createdById: session.userId,
    },
  });
  await prisma.contract.update({
    where: { id: contractId },
    data: { generatedDocUrl: fileUrl, pendingNewUpload: false },
  });

  revalidatePath(`/contracts/${contractId}`);
  return { ok: true, data: { versionNo, fileUrl } };
}

/** Submit-review path A: use the current generated/uploaded contract as-is.
 *  Moves status to REVIEWING. */
export async function submitForReviewUseCurrent(contractId: string): Promise<Result> {
  const session = await requireSession();
  try {
    await requireFeaturePermission(session, "contracts.signing", "EDIT");
  } catch (error) {
    if (error instanceof FeaturePermissionError) return { ok: false, error: "无权编辑合同" };
    throw error;
  }
  const c = await prisma.contract.findFirst({
    where: { id: contractId, ...contractScope(session, session.role === "ADMIN" ? "all" : "mine") },
    select: { id: true, status: true, generatedDocUrl: true },
  });
  if (!c) return { ok: false, error: "合同不存在" };
  if (c.status !== "IN_PROGRESS" && c.status !== "REJECTED") {
    return { ok: false, error: "仅「推进中」或「审核退回」状态的合同可提交审核" };
  }
  if (!c.generatedDocUrl) return { ok: false, error: "请先生成或上传一份合同文件" };

  const round = await openReviewRound(contractId);
  if (!round.ok) return { ok: false, error: round.error };

  await prisma.contract.update({
    where: { id: contractId },
    data: { status: "REVIEWING", pendingNewUpload: false },
  });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  revalidatePath("/contracts/reviews");
  return { ok: true };
}

/** Submit-review path B: upload a new .docx version, store as new
 *  ContractVersion (reason records that terms changed), and move status to REVIEWING.
 *  Field re-extraction is the reviewer's next step (handled later). */
export async function submitForReviewUploadNew(fd: FormData): Promise<Result<{ versionNo: number }>> {
  const session = await requireSession();
  try {
    await requireFeaturePermission(session, "contracts.signing", "EDIT");
  } catch (error) {
    if (error instanceof FeaturePermissionError) return { ok: false, error: "无权编辑合同" };
    throw error;
  }
  const contractId = String(fd.get("contractId") ?? "");
  const file = fd.get("file");
  if (!contractId) return { ok: false, error: "缺少合同 id" };
  if (!(file instanceof File)) return { ok: false, error: "请选择文件" };
  if (!file.name.toLowerCase().endsWith(".docx")) return { ok: false, error: "仅支持 .docx 文件" };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "文件超过 20MB" };

  const c = await prisma.contract.findFirst({
    where: { id: contractId, ...contractScope(session, session.role === "ADMIN" ? "all" : "mine") },
    include: { customer: { select: { brandName: true } } },
  });
  if (!c) return { ok: false, error: "合同不存在" };
  if (c.status !== "IN_PROGRESS" && c.status !== "REJECTED") {
    return { ok: false, error: "仅「推进中」或「审核退回」状态的合同可上传新版" };
  }

  const versionNo = await nextVersionNo(contractId);
  const fileName = `${contractFileBaseName(c)}-v${versionNo}.docx`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { fileUrl } = await writePrivateContractFile("contracts-generated", fileName, buf);

  await prisma.contractVersion.create({
    data: {
      contractId,
      versionNo,
      fileUrl,
      fileType: "docx",
      reason: "审核前上传新版（合同条款有修改，请重点查看）",
      createdById: session.userId,
    },
  });
  const round = await openReviewRound(contractId);
  if (!round.ok) return { ok: false, error: round.error };

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      status: "REVIEWING",
      generatedDocUrl: fileUrl,
      pendingNewUpload: true, // flag for the reviewer to trigger re-extraction
    },
  });

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  revalidatePath("/contracts/reviews");
  return { ok: true, data: { versionNo } };
}
