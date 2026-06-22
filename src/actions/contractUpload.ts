"use server";

import { revalidatePath } from "next/cache";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { extractDocxText } from "@/lib/contractDocxExtract";
import {
  aiExtractContractFields,
  UPLOAD_EXTRACT_REQUIRED,
} from "@/lib/contractAiExtract";
import { contractFileBaseName } from "@/lib/contractFileName";
import { openReviewRound } from "@/actions/contractReview";
import { bumpCustomerStatus } from "@/lib/customer";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const OUT_DIR_ABS = path.join(process.cwd(), "public", "contracts-generated");
const OUT_PREFIX = "/contracts-generated";

function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

/** Generate the next contract number for a given prefix (mirrors contracts.ts). */
async function nextContractNo(prefix: "LYNQ" | "THRAIVE"): Promise<string> {
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

/** Map AI-extracted keys to Prisma Contract field names. */
function mapExtractedToContract(fields: Record<string, unknown>): Record<string, unknown> {
  const get = (k: string) => {
    const v = fields[k];
    if (v == null) return null;
    if (typeof v === "string") return v.trim() || null;
    return v;
  };
  const date = (k: string) => {
    const v = get(k);
    if (typeof v !== "string") return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const coop = Array.isArray(fields.coopChannels)
    ? JSON.stringify(fields.coopChannels.filter((x) => typeof x === "string"))
    : null;
  return {
    partyA: get("partyAName"),
    partyACreditCode: get("partyACreditCode"),
    partyAAddress: get("partyAAddress"),
    partyAContact: get("partyAContact"),
    partyAPhone: get("partyAPhone"),
    partyAEmail: get("partyAEmail"),
    startDate: date("startDate"),
    endDate: date("endDate"),
    feeAmount: get("feeAmount"),
    feeCurrency: get("feeCurrency"),
    feeCycle: get("feeCycle"),
    commissionRate: get("commissionRate"),
    promoPlatform: get("promoPlatform"),
    targetSite: get("targetSite"),
    coopChannels: coop,
  };
}

/** Upload an existing .docx contract → AI extract fields → create Contract +
 *  ContractVersion v1. Returns the new contract id + list of missing required
 *  fields so the UI can prompt the user to fill them in. The caller decides
 *  whether to also auto-submit for review. */
export async function uploadExistingContract(
  fd: FormData,
): Promise<Result<{ contractId: string; missing: { key: string; label: string }[]; autoSubmitted: boolean }>> {
  const session = await requireSession();
  if (session.role === "BRAND" || session.role === "CHANNEL") {
    return { ok: false, error: "无权创建合同" };
  }

  const customerId = s(fd, "customerId");
  if (!customerId) return { ok: false, error: "请选择关联客户" };
  const type = s(fd, "type") || "BRAND";
  const templateId = s(fd, "templateId") || null;
  const partyBCompany = s(fd, "partyBCompany") || null;
  const noPrefix = (s(fd, "contractNoPrefix") as "LYNQ" | "THRAIVE") || "THRAIVE";

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "请选择合同 .docx 文件" };
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return { ok: false, error: "仅支持 .docx 文件" };
  }
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: "文件超过 25MB" };

  // 1) Read + extract text
  const buf = Buffer.from(await file.arrayBuffer());
  let text = "";
  try {
    text = await extractDocxText(buf);
  } catch {
    return { ok: false, error: "解析 .docx 失败：文件可能已损坏" };
  }
  if (!text.trim()) return { ok: false, error: ".docx 中未识别到文字内容" };

  // 2) AI extract
  const ai = await aiExtractContractFields(text);
  if (!ai.ok) return { ok: false, error: ai.error };

  // 3) Build contract data
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, brandName: true },
  });
  if (!customer) return { ok: false, error: "客户不存在" };

  const contractNo = await nextContractNo(noPrefix);
  const ownerId = s(fd, "ownerId") || session.userId;
  const reviewerId = s(fd, "reviewerId") || null;

  const mapped = mapExtractedToContract(ai.fields as Record<string, unknown>);

  // 4) Persist file
  await fs.mkdir(OUT_DIR_ABS, { recursive: true });
  const base = contractFileBaseName({
    contractNo,
    createdAt: new Date(),
    partyA: typeof mapped.partyA === "string" ? mapped.partyA : null,
    customer,
  });
  const savedName = `${base}-v1.docx`;
  await fs.writeFile(path.join(OUT_DIR_ABS, savedName), buf);
  const fileUrl = `${OUT_PREFIX}/${savedName}`;

  // 5) Create contract
  const contract = await prisma.contract.create({
    data: {
      contractNo,
      customerId,
      type,
      status: "IN_PROGRESS",
      uploadType: "EXISTING",
      fillMethod: "AI_EXTRACT",
      extractedBy: "AI",
      templateId,
      partyBCompany,
      ownerId,
      reviewerId,
      contractText: text,
      generatedDocUrl: fileUrl,
      createdById: session.userId,
      ...mapped,
    },
    select: { id: true },
  });

  await prisma.contractVersion.create({
    data: {
      contractId: contract.id,
      versionNo: 1,
      fileUrl,
      fileType: "docx",
      reason: "上传已有合同（AI 抽字段）",
      createdById: session.userId,
    },
  });

  await bumpCustomerStatus(customerId, "CONTRACT_IN_PROGRESS");

  // 6) If all required fields are present → auto-submit for review
  let autoSubmitted = false;
  if (ai.missing.length === 0) {
    const round = await openReviewRound(contract.id);
    if (round.ok) {
      await prisma.contract.update({
        where: { id: contract.id },
        data: { status: "REVIEWING" },
      });
      autoSubmitted = true;
    }
    // 如果 openReviewRound 失败（没有审核人），合同仍保留 IN_PROGRESS，让用户手动提交
  }

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contract.id}`);
  if (autoSubmitted) revalidatePath("/contracts/reviews");

  return {
    ok: true,
    data: {
      contractId: contract.id,
      missing: ai.missing,
      autoSubmitted,
    },
  };
}

/** Public helper for UI to know which fields will be flagged as missing. */
export async function getUploadRequiredFields() {
  await requireSession();
  return UPLOAD_EXTRACT_REQUIRED;
}
