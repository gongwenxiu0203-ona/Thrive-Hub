"use server";

import { revalidatePath } from "next/cache";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { fillContractTemplate } from "@/lib/contractTemplateFill";
import { buildPlaceholderMap } from "@/lib/contractPlaceholders";
import { contractFileBaseName } from "@/lib/contractFileName";
import { openReviewRound } from "@/actions/contractReview";
import { resolveContractTemplateBuffer } from "@/lib/contractTemplateResolve";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const OUT_DIR_ABS = path.join(process.cwd(), "public", "contracts-generated");
const OUT_PREFIX = "/contracts-generated";

/** Resolve current version count + return the next versionNo. */
async function nextVersionNo(contractId: string): Promise<number> {
  const last = await prisma.contractVersion.findFirst({
    where: { contractId },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  });
  return (last?.versionNo ?? 0) + 1;
}

/** Internal: pick the template buffer for a contract. Falls back to error if
 *  no template is selected. */
async function loadTemplateFor(contractId: string): Promise<{ buffer: Buffer; templateName: string; templateKey: string } | { error: string }> {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { templateId: true, template: true },
  });
  if (!c) return { error: "合同不存在" };
  if (!c.templateId) return { error: "请先在合同上选择适用的模板" };
  const tpl = await resolveContractTemplateBuffer(c.template);
  if ("error" in tpl) return tpl;
  return { buffer: tpl.buffer, templateName: tpl.templateName, templateKey: tpl.templateKey };
}

/** Fill the contract's selected template with current field values, write the
 *  output as a new ContractVersion, and update contract.generatedDocUrl. */
export async function generateContractFromTemplate(
  contractId: string,
  reason: string = "首次生成"
): Promise<Result<{ versionNo: number; fileUrl: string }>> {
  const session = await requireSession();

  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: { select: { brandName: true } }, template: true },
  });
  if (!c) return { ok: false, error: "合同不存在" };

  const tpl = await loadTemplateFor(contractId);
  if ("error" in tpl) return { ok: false, error: tpl.error };

  const fields = { ...buildPlaceholderMap(c), templateKey: tpl.templateKey };
  const filled = await fillContractTemplate(tpl.buffer, fields);

  const versionNo = await nextVersionNo(contractId);
  await fs.mkdir(OUT_DIR_ABS, { recursive: true });
  const fileName = `${contractFileBaseName(c)}-v${versionNo}.docx`;
  await fs.writeFile(path.join(OUT_DIR_ABS, fileName), filled);
  const fileUrl = `${OUT_PREFIX}/${fileName}`;

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
  await requireSession();
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
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
  const contractId = String(fd.get("contractId") ?? "");
  const file = fd.get("file");
  if (!contractId) return { ok: false, error: "缺少合同 id" };
  if (!(file instanceof File)) return { ok: false, error: "请选择文件" };
  if (!file.name.toLowerCase().endsWith(".docx")) return { ok: false, error: "仅支持 .docx 文件" };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "文件超过 20MB" };

  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: { select: { brandName: true } } },
  });
  if (!c) return { ok: false, error: "合同不存在" };
  if (c.status !== "IN_PROGRESS" && c.status !== "REJECTED") {
    return { ok: false, error: "仅「推进中」或「审核退回」状态的合同可上传新版" };
  }

  const versionNo = await nextVersionNo(contractId);
  await fs.mkdir(OUT_DIR_ABS, { recursive: true });
  const fileName = `${contractFileBaseName(c)}-v${versionNo}.docx`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(OUT_DIR_ABS, fileName), buf);
  const fileUrl = `${OUT_PREFIX}/${fileName}`;

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
