"use server";

import { revalidatePath } from "next/cache";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { extractDocxContent } from "@/lib/contractDocxExtract";
import { extractPdfText } from "@/lib/contractPdfExtract";
import {
  aiExtractContractFields,
  uploadRequiredFields,
} from "@/lib/contractAiExtract";
import { contractFileBaseName } from "@/lib/contractFileName";
import { openReviewRound } from "@/actions/contractReview";
import { bumpCustomerStatus } from "@/lib/customer";
import { ensureReconciliationForContract } from "@/actions/channelSplit";
import { syncContractProgressToProjects } from "@/actions/projects";
import {
  commissionConfigFromLegacy,
  normalizeTemplateKey,
  primaryRateFromCommissionConfig,
  stringifyCommissionConfig,
} from "@/lib/contractCommissionConfig";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };
type UploadArchiveMode = "SIGNED_ARCHIVE" | "REVIEW_AND_STAMP";
type UploadExistingContractData = {
  contractId: string | null;
  missing: { key: string; label: string }[];
  autoSubmitted: boolean;
  archived: boolean;
  needsTemplate: boolean;
  needsSupplement: boolean;
  fields: Record<string, unknown>;
  sourceTextPreview: string;
  sourcePreviewHtml: string;
  sourceFileType: "docx" | "pdf";
  detectedTemplateKey: string;
};

const OUT_DIR_ABS = path.join(process.cwd(), "public", "contracts-generated");
const OUT_PREFIX = "/contracts-generated";

function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

async function nextContractNo(prefix: "LYNQ" | "THRAIVE"): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await prisma.contract.findMany({
    where: { contractNo: { startsWith: `${prefix}-${year}-` } },
    select: { contractNo: true },
  });
  let max = 0;
  for (const { contractNo } of existing) {
    const seq = parseInt(contractNo.split("-").pop() ?? "0", 10);
    if (!Number.isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

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
    return Number.isNaN(d.getTime()) ? null : d;
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
    commissionType: get("commissionType"),
    thresholdAmount: get("thresholdAmount"),
    thresholdCurrency: get("thresholdCurrency"),
    thresholdReachedRate: get("thresholdReachedRate"),
    thresholdUnreachedRate: get("thresholdUnreachedRate"),
    tieredRules: get("tieredRules"),
    excessBaseMonths: get("excessBaseMonths"),
    excessCommissionRate: get("excessCommissionRate"),
    specialCommissionTerms: get("specialCommissionTerms"),
    gmvSettlementCycle: get("gmvSettlementCycle"),
    promoPlatform: get("promoPlatform"),
    targetSite: get("targetSite"),
    coopChannels: coop,
  };
}

function applyOverrides(mapped: Record<string, unknown>, fd: FormData): Record<string, unknown> {
  const next = { ...mapped };
  for (const key of Object.keys(next)) {
    const override = s(fd, `override:${key}`);
    if (override) next[key] = override;
  }
  return next;
}

function valueMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function contractCreateFields(mapped: Record<string, unknown>): Record<string, unknown> {
  const { thresholdReachedRate: _reached, thresholdUnreachedRate: _unreached, ...persisted } = mapped;
  return persisted;
}

function textPreviewHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body {
    margin: 0;
    padding: 18px;
    color: #334155;
    font-family: Arial, "Microsoft YaHei", sans-serif;
    font-size: 13px;
    line-height: 1.65;
    background: #f8fafc;
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
</head>
<body><pre>${escaped || "未识别到可展示的原文内容"}</pre></body>
</html>`;
}

export async function uploadExistingContract(
  fd: FormData,
): Promise<Result<UploadExistingContractData>> {
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
  const uploadArchiveMode = (s(fd, "uploadArchiveMode") as UploadArchiveMode) || "REVIEW_AND_STAMP";
  const finalizeUpload = s(fd, "finalizeUpload") === "1";

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "请选择合同文件" };
  const lowerName = file.name.toLowerCase();
  const ext = lowerName.endsWith(".pdf") ? "pdf" : lowerName.endsWith(".docx") ? "docx" : "";
  if (!ext) return { ok: false, error: "仅支持 .docx 或 .pdf 文件" };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: "文件超过 25MB" };

  const buf = Buffer.from(await file.arrayBuffer());
  let text = "";
  let sourcePreviewHtml = "";
  try {
    if (ext === "pdf") {
      text = await extractPdfText(buf);
      sourcePreviewHtml = textPreviewHtml(text);
    } else {
      const docx = await extractDocxContent(buf);
      text = docx.text;
      sourcePreviewHtml = docx.html;
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? error.message
        : "解析合同文件失败：文件可能已损坏或不可识别",
    };
  }
  if (!text.trim()) return { ok: false, error: "合同文件中未识别到文字内容" };

  const ai = await aiExtractContractFields(text);
  if (!ai.ok) return { ok: false, error: ai.error };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, brandName: true },
  });
  if (!customer) return { ok: false, error: "客户不存在" };

  const ownerId = s(fd, "ownerId") || session.userId;
  const reviewerId = s(fd, "reviewerId") || null;
  const mapped = applyOverrides(mapExtractedToContract(ai.fields as Record<string, unknown>), fd);

  // 适用模板：① 用户手选优先；② 否则按 AI 识别出的佣金结算方式自动匹配同类型
  // 模板（命中则自动选用）；③ 仍无则 templateId 为 null，需在补填环节手动选择。
  let resolvedTemplate = templateId
    ? await prisma.contractTemplate.findUnique({ where: { id: templateId }, select: { id: true, templateKey: true } })
    : null;
  if (!resolvedTemplate && typeof mapped.commissionType === "string" && mapped.commissionType.trim()) {
    resolvedTemplate = await prisma.contractTemplate.findFirst({
      where: { templateKey: normalizeTemplateKey(mapped.commissionType), deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, templateKey: true },
    });
  }
  const resolvedTemplateId = resolvedTemplate?.id ?? null;
  const templateKey = normalizeTemplateKey(
    resolvedTemplate?.templateKey
      ?? (typeof mapped.commissionType === "string" ? mapped.commissionType : null)
      ?? "FIXED",
  );
  const commissionConfig = commissionConfigFromLegacy({
    templateKey,
    commissionRate: typeof mapped.commissionRate === "string" ? mapped.commissionRate : null,
    thresholdAmount: typeof mapped.thresholdAmount === "string" ? mapped.thresholdAmount : null,
    thresholdCurrency: typeof mapped.thresholdCurrency === "string" ? mapped.thresholdCurrency : null,
    tieredRules: typeof mapped.tieredRules === "string" ? mapped.tieredRules : null,
    excessBaseMonths: typeof mapped.excessBaseMonths === "string" ? mapped.excessBaseMonths : null,
    excessCommissionRate: typeof mapped.excessCommissionRate === "string" ? mapped.excessCommissionRate : null,
    specialCommissionTerms: typeof mapped.specialCommissionTerms === "string" ? mapped.specialCommissionTerms : null,
  });
  if (templateKey === "THRESHOLD") {
    commissionConfig.threshold = {
      ...commissionConfig.threshold,
      reachedRate: String(mapped.thresholdReachedRate ?? commissionConfig.threshold?.reachedRate ?? ""),
      unreachedRate: String(mapped.thresholdUnreachedRate ?? commissionConfig.threshold?.unreachedRate ?? ""),
    };
  }
  const primaryRate = primaryRateFromCommissionConfig(commissionConfig);
  const persistedMapped = contractCreateFields(mapped);

  // 重算缺失的必填字段：以最终落库值为准（模板派生的 commissionType、AI 识别的
  // feeCycle 等已算作已填）。仅这些缺失才强制补填，其余字段未识别可忽略。
  const finalForMissing: Record<string, unknown> = {
    ...mapped,
    commissionType: templateKey,
    commissionRate: primaryRate ?? mapped.commissionRate,
  };
  const requiredFields = uploadRequiredFields(uploadArchiveMode, templateKey);
  const missing = requiredFields.filter((f) => {
    const v = finalForMissing[f.key];
    return valueMissing(v);
  });
  const needsTemplate = !resolvedTemplateId;

  if ((missing.length > 0 || needsTemplate) && !finalizeUpload) {
    return {
      ok: true,
      data: {
        contractId: null,
        missing,
        autoSubmitted: false,
        archived: false,
        needsTemplate,
        needsSupplement: true,
        fields: finalForMissing,
        sourceTextPreview: text,
        sourcePreviewHtml,
        sourceFileType: ext,
        detectedTemplateKey: templateKey,
      },
    };
  }

  if (needsTemplate) return { ok: false, error: "请选择适用的合同模板后再确认" };
  if (missing.length > 0) {
    return { ok: false, error: `仍有 ${missing.length} 个关键字段未补齐，请先补齐后再确认` };
  }

  let contract: { id: string; contractNo: string } | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const contractNo = await nextContractNo(noPrefix);
    try {
      contract = await (prisma.contract.create as any)({
        data: {
          contractNo,
          customerId,
          type,
          status: uploadArchiveMode === "SIGNED_ARCHIVE" && missing.length === 0 ? "COMPLETED" : "IN_PROGRESS",
          uploadType: "EXISTING",
          uploadArchiveMode,
          fillMethod: "AI_EXTRACT",
          extractedBy: "AI",
          templateId: resolvedTemplateId,
          partyBCompany,
          ownerId,
          reviewerId,
          contractText: text,
          ...persistedMapped,
          commissionType: templateKey,
          commissionRate: primaryRate ?? (typeof mapped.commissionRate === "string" ? mapped.commissionRate : null),
          commissionConfig: stringifyCommissionConfig(commissionConfig),
          createdById: session.userId,
        },
        select: { id: true, contractNo: true },
      });
      break;
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  if (!contract) {
    console.warn("[uploadExistingContract] contractNo conflict after 3 retries:", lastError);
    return { ok: false, error: "合同编号冲突，请稍后重试" };
  }

  await fs.mkdir(OUT_DIR_ABS, { recursive: true });
  const base = contractFileBaseName({
    contractNo: contract.contractNo,
    createdAt: new Date(),
    partyA: typeof mapped.partyA === "string" ? mapped.partyA : null,
    customer,
  });
  const savedName = `${base}-${contract.id}-v1.${ext}`;
  await fs.writeFile(path.join(OUT_DIR_ABS, savedName), buf);
  const fileUrl = `${OUT_PREFIX}/${savedName}`;

  await prisma.contract.update({
    where: { id: contract.id },
    data: { generatedDocUrl: fileUrl },
  });

  await prisma.contractVersion.create({
    data: {
      contractId: contract.id,
      versionNo: 1,
      fileUrl,
      fileType: ext,
      reason: "上传已有合同（字段识别）",
      createdById: session.userId,
    },
  });

  const archived = uploadArchiveMode === "SIGNED_ARCHIVE" && missing.length === 0;
  if (archived) {
    await syncContractProgressToProjects(contract.id, "签署完成");
    await bumpCustomerStatus(customerId, "CONTRACT_SIGNED");
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { channelUserId: true },
    });
    if (customer?.channelUserId) {
      await ensureReconciliationForContract({
        contractId: contract.id,
        customerId,
        channelUserId: customer.channelUserId,
        createdById: session.userId,
      });
    }
  } else {
    await bumpCustomerStatus(customerId, "CONTRACT_IN_PROGRESS");
  }

  let autoSubmitted = false;
  if (uploadArchiveMode !== "SIGNED_ARCHIVE" && missing.length === 0) {
    const round = await openReviewRound(contract.id);
    if (round.ok) {
      await prisma.contract.update({
        where: { id: contract.id },
        data: { status: "REVIEWING" },
      });
      autoSubmitted = true;
    }
  }

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contract.id}`);
  if (autoSubmitted) revalidatePath("/contracts/reviews");

  return {
    ok: true,
    data: {
      contractId: contract.id,
      missing,
      autoSubmitted,
      archived,
      needsTemplate,
      needsSupplement: false,
      fields: finalForMissing,
      sourceTextPreview: text,
      sourcePreviewHtml,
      sourceFileType: ext,
      detectedTemplateKey: templateKey,
    },
  };
}

export async function getUploadRequiredFields() {
  await requireSession();
  return uploadRequiredFields("SIGNED_ARCHIVE");
}
