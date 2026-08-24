"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureCustomerReconciliationPlan } from "@/lib/customerReconciliationPlan";
import { requireSession } from "@/lib/session";
import { extractDocxContent } from "@/lib/contractDocxExtract";
import { extractPdfEmbeddedText } from "@/lib/contractPdfExtract";
import {
  aiExtractContractFields,
  uploadRequiredFields,
} from "@/lib/contractAiExtract";
import { contractFileBaseName } from "@/lib/contractFileName";
import { bumpCustomerStatus } from "@/lib/customer";
import { syncContractProgressToProjects } from "@/actions/projects";
import {
  commissionConfigFromLegacy,
  normalizeTemplateKey,
  primaryRateFromCommissionConfig,
  stringifyCommissionConfig,
} from "@/lib/contractCommissionConfig";
import { writePrivateContractFile } from "@/lib/contractFileStorage";
import { customerScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { CONTRACT_UPLOAD_MAX_BYTES, CONTRACT_UPLOAD_MAX_MB } from "@/lib/contractUploadLimits";
import {
  CONTRACT_FEE_CURRENCIES,
  CONTRACT_FEE_CYCLES,
  CONTRACT_GMV_CYCLES,
} from "@/lib/contractFormOptions";

export type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };
export type UploadExistingContractData = {
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
  const coop = Array.isArray(fields.coopChannels)
    ? JSON.stringify(fields.coopChannels.filter((x) => typeof x === "string"))
    : get("coopChannels");
  const products = Array.isArray(fields.productList)
    ? JSON.stringify(fields.productList.filter((item) => item && typeof item === "object"))
    : get("productList");
  const partyBBanks = Array.isArray(fields.partyBBankAccounts)
    ? JSON.stringify(fields.partyBBankAccounts.filter((x) => typeof x === "string"))
    : get("partyBBankAccounts");
  return {
    partyA: get("partyAName"),
    partyACreditCode: get("partyACreditCode"),
    partyAAddress: get("partyAAddress"),
    partyAContact: get("partyAContact"),
    partyAPhone: get("partyAPhone"),
    partyAEmail: get("partyAEmail"),
    // Keep extracted dates raw until overrides have been applied. Both paths
    // must pass through normalizeContractDates before reaching Prisma.
    startDate: get("startDate"),
    endDate: get("endDate"),
    taxType: get("taxType"),
    taxBearer: get("taxBearer"),
    feeAmount: get("feeAmount"),
    feeCurrency: get("feeCurrency"),
    feeCycle: get("feeCycle"),
    commissionRate: get("commissionRate"),
    commissionType: get("commissionType"),
    commissionConfig: get("commissionConfig"),
    thresholdAmount: get("thresholdAmount"),
    thresholdCurrency: get("thresholdCurrency"),
    thresholdReachedRate: get("thresholdReachedRate"),
    thresholdUnreachedRate: get("thresholdUnreachedRate"),
    tieredRules: get("tieredRules"),
    excessBaseMonths: get("excessBaseMonths"),
    excessCommissionRate: get("excessCommissionRate"),
    specialCommissionTerms: get("specialCommissionTerms"),
    specialTotalCommissionRate: get("specialTotalCommissionRate"),
    specialSalesCommissionRate: get("specialSalesCommissionRate"),
    specialAttributionRate: get("specialAttributionRate"),
    specialCreatorRate: get("specialCreatorRate"),
    specialLowThreshold: get("specialLowThreshold"),
    specialLowBudgetRate: get("specialLowBudgetRate"),
    specialHighThreshold: get("specialHighThreshold"),
    specialHighServiceRate: get("specialHighServiceRate"),
    specialGmvCurrency: get("specialGmvCurrency"),
    gmvSettlementCycle: get("gmvSettlementCycle"),
    promoPlatform: get("promoPlatform"),
    targetSite: get("targetSite"),
    coopChannels: coop,
    productList: products,
    partyBBankAccounts: partyBBanks,
  };
}

function parseContractDate(value: unknown): Date | null | "INVALID" {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "INVALID" : value;
  if (typeof value !== "string") return "INVALID";

  const raw = value.trim();
  if (!raw) return null;
  // Contract form dates use YYYY-MM-DD. Strict validation avoids JavaScript
  // silently rolling invalid values such as 2026-02-30 into another month.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return "INVALID";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return "INVALID";
  return parsed;
}

function normalizeContractDates(mapped: Record<string, unknown>):
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; error: string } {
  const fields = { ...mapped };
  for (const [key, label] of [
    ["startDate", "合作开始日期"],
    ["endDate", "合作结束日期"],
  ] as const) {
    const parsed = parseContractDate(fields[key]);
    if (parsed === "INVALID") {
      return { ok: false, error: `${label}格式无效，请使用 YYYY-MM-DD 格式并填写真实日期` };
    }
    fields[key] = parsed;
  }
  return { ok: true, fields };
}

function validateMappedContractFields(mapped: Record<string, unknown>): string | null {
  const allowed = (key: string, values: readonly string[], label: string) => {
    const value = mapped[key];
    return value && !values.includes(String(value)) ? `${label}选项无效，请重新选择` : null;
  };
  const optionError = allowed("feeCurrency", CONTRACT_FEE_CURRENCIES, "固定服务费货币")
    ?? allowed("feeCycle", CONTRACT_FEE_CYCLES, "固费支付周期")
    ?? allowed("gmvSettlementCycle", CONTRACT_GMV_CYCLES, "GMV结算周期");
  if (optionError) return optionError;
  if (mapped.taxType && !["不含税", "含税"].includes(String(mapped.taxType))) return "税费类型选项无效，请重新选择";

  for (const [key, label] of [
    ["commissionRate", "GMV抽佣比例"],
    ["thresholdReachedRate", "达标后抽佣比例"],
    ["thresholdUnreachedRate", "未达标抽佣比例"],
    ["excessCommissionRate", "超额增长佣金比例"],
  ] as const) {
    if (mapped[key] == null || mapped[key] === "") continue;
    const number = Number(String(mapped[key]).replace(/%/g, ""));
    if (!Number.isFinite(number) || number < 0 || number > 100) return `${label}必须是 0 到 100 之间的数字`;
  }
  for (const [key, label] of [["feeAmount", "月度服务费金额"], ["thresholdAmount", "GMV门槛金额"]] as const) {
    if (mapped[key] == null || mapped[key] === "") continue;
    const number = Number(mapped[key]);
    if (!Number.isFinite(number) || number < 0) return `${label}必须是非负数字`;
  }
  const start = mapped.startDate;
  const end = mapped.endDate;
  if (start instanceof Date && end instanceof Date && start > end) return "合作开始日期不能晚于合作结束日期";
  return null;
}

function applyOverrides(mapped: Record<string, unknown>, fd: FormData): Record<string, unknown> {
  const next = { ...mapped };
  for (const key of Object.keys(next)) {
    const formKey = `override:${key}`;
    if (fd.has(formKey)) next[key] = s(fd, formKey) || null;
  }
  return next;
}

function valueMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return !trimmed || trimmed === "[]";
  }
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function contractCreateFields(mapped: Record<string, unknown>): Record<string, unknown> {
  const {
    thresholdReachedRate: _reached,
    thresholdUnreachedRate: _unreached,
    specialAttributionRate: _specialAttributionRate,
    specialCreatorRate: _specialCreatorRate,
    specialTotalCommissionRate: _specialTotalCommissionRate,
    specialSalesCommissionRate: _specialSalesCommissionRate,
    specialLowThreshold: _specialLowThreshold,
    specialLowBudgetRate: _specialLowBudgetRate,
    specialHighThreshold: _specialHighThreshold,
    specialHighServiceRate: _specialHighServiceRate,
    specialGmvCurrency: _specialGmvCurrency,
    ...persisted
  } = mapped;
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

function createAiResult(fields: Record<string, unknown>) {
  return {
    ok: true as const,
    fields,
    missing: [] as { key: string; label: string }[],
  };
}

export async function uploadExistingContract(
  fd: FormData,
): Promise<Result<UploadExistingContractData>> {
  const session = await requireSession();
  try {
    await requireFeaturePermission(session, "contracts.create_upload", "EDIT");
  } catch (error) {
    if (error instanceof FeaturePermissionError) return { ok: false, error: "无权创建合同" };
    throw error;
  }

  const customerId = s(fd, "customerId");
  if (!customerId) return { ok: false, error: "请选择关联客户" };
  const type = s(fd, "type") || "BRAND";
  const templateId = s(fd, "templateId") || null;
  const partyBCompany = s(fd, "partyBCompany") || null;
  const noPrefix = (s(fd, "contractNoPrefix") as "LYNQ" | "THRAIVE") || "THRAIVE";
  const uploadArchiveMode = "SIGNED_ARCHIVE" as const;
  const finalizeUpload = s(fd, "finalizeUpload") === "1";

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "请选择合同文件" };
  const lowerName = file.name.toLowerCase();
  const ext = lowerName.endsWith(".pdf") ? "pdf" : lowerName.endsWith(".docx") ? "docx" : "";
  if (!ext) return { ok: false, error: "仅支持 .docx 或 .pdf 文件" };
  if (file.size > CONTRACT_UPLOAD_MAX_BYTES) {
    return { ok: false, error: `\u6587\u4ef6\u8d85\u8fc7 ${CONTRACT_UPLOAD_MAX_MB}MB\uff0c\u8bf7\u538b\u7f29\u540e\u518d\u4e0a\u4f20` };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let text = "";
  let sourcePreviewHtml = "";
  try {
    if (ext === "pdf") {
      text = await extractPdfEmbeddedText(buf);
      sourcePreviewHtml = textPreviewHtml(text);
    } else {
      const docx = await extractDocxContent(buf);
      text = docx.text;
      sourcePreviewHtml = docx.html;
    }
  } catch (error) {
    console.error("[contract-upload] failed to parse source document", {
      fileName: file.name,
      fileType: ext,
      error,
    });
    return {
      ok: false,
      error: "解析合同文件失败：文件可能已损坏、格式不兼容或不包含可识别内容",
    };
  }

  const ai = text.trim() ? await aiExtractContractFields(text) : createAiResult({});
  if (!ai.ok) return { ok: false, error: ai.error };

  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      ...customerScope(session, session.role === "ADMIN" ? "all" : "mine"),
      deletedAt: null,
    },
    select: { id: true, brandName: true },
  });
  if (!customer) return { ok: false, error: "客户不存在" };

  const ownerId = s(fd, "ownerId") || session.userId;
  const reviewerId = s(fd, "reviewerId") || null;
  const withOverrides = applyOverrides(mapExtractedToContract(ai.fields as Record<string, unknown>), fd);
  const normalizedDates = normalizeContractDates(withOverrides);
  if (!normalizedDates.ok) return normalizedDates;
  const mapped = normalizedDates.fields;
  const mappedError = validateMappedContractFields(mapped);
  if (mappedError) return { ok: false, error: mappedError };

  const ownerExists = await prisma.user.findFirst({ where: { id: ownerId, status: "APPROVED" }, select: { id: true } });
  if (!ownerExists) return { ok: false, error: "合同负责人不存在或账号不可用，请重新选择" };

  // 适用模板：① 用户手选优先；② 否则按 AI 识别出的佣金结算方式自动匹配同类型
  // 模板（命中则自动选用）；③ 仍无则 templateId 为 null，需在补填环节手动选择。
  let resolvedTemplate = templateId
    ? await prisma.contractTemplate.findFirst({ where: { id: templateId, deletedAt: null }, select: { id: true, templateKey: true } })
    : null;
  if (templateId && !resolvedTemplate) return { ok: false, error: "所选合同模板不存在或已停用，请重新选择" };
  if (!resolvedTemplate && typeof mapped.commissionType === "string" && mapped.commissionType.trim()) {
    resolvedTemplate = await prisma.contractTemplate.findFirst({
      where: { templateKey: normalizeTemplateKey(mapped.commissionType), deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, templateKey: true },
    });
  }
  const resolvedTemplateId = resolvedTemplate?.id ?? null;
  const detectedTemplateKey = typeof mapped.commissionType === "string" && mapped.commissionType.trim()
    ? normalizeTemplateKey(mapped.commissionType)
    : "";
  const templateKey = normalizeTemplateKey(
    resolvedTemplate?.templateKey
      ?? detectedTemplateKey
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
    commissionConfig: mapped.commissionConfig,
  });
  commissionConfig.templateKey = templateKey;
  if (templateKey === "THRESHOLD") {
    const hasConfigOverride = fd.has("override:commissionConfig");
    const configThreshold = commissionConfig.threshold;
    const thresholdValue = (
      key: "thresholdCurrency" | "thresholdAmount" | "thresholdReachedRate" | "thresholdUnreachedRate",
      configValue: unknown,
    ) => {
      if (fd.has(`override:${key}`)) return mapped[key];
      if (hasConfigOverride) return configValue ?? mapped[key];
      return mapped[key] ?? configValue;
    };
    commissionConfig.threshold = {
      ...configThreshold,
      currency: String(thresholdValue("thresholdCurrency", configThreshold?.currency) ?? "USD"),
      amount: String(thresholdValue("thresholdAmount", configThreshold?.amount) ?? ""),
      reachedRate: String(thresholdValue("thresholdReachedRate", configThreshold?.reachedRate) ?? ""),
      unreachedRate: String(thresholdValue("thresholdUnreachedRate", configThreshold?.unreachedRate) ?? ""),
    };
  }
  if (templateKey === "SPECIAL") {
    commissionConfig.special = {
      ...commissionConfig.special,
      totalCommissionRate: String(
        mapped.specialTotalCommissionRate
          ?? mapped.specialAttributionRate
          ?? commissionConfig.special?.totalCommissionRate
          ?? commissionConfig.special?.attributionRate
          ?? "",
      ),
      salesCommissionRate: String(
        mapped.specialSalesCommissionRate
          ?? mapped.specialCreatorRate
          ?? commissionConfig.special?.salesCommissionRate
          ?? commissionConfig.special?.creatorRate
          ?? "",
      ),
      attributionRate: String(mapped.specialAttributionRate ?? commissionConfig.special?.attributionRate ?? ""),
      creatorRate: String(mapped.specialCreatorRate ?? commissionConfig.special?.creatorRate ?? ""),
      lowGmvThresholdCurrency: String(mapped.specialGmvCurrency ?? commissionConfig.special?.lowGmvThresholdCurrency ?? "USD"),
      highGmvThresholdCurrency: String(mapped.specialGmvCurrency ?? commissionConfig.special?.highGmvThresholdCurrency ?? "USD"),
      lowGmvThreshold: String(mapped.specialLowThreshold ?? commissionConfig.special?.lowGmvThreshold ?? ""),
      lowGmvBudgetRate: String(mapped.specialLowBudgetRate ?? commissionConfig.special?.lowGmvBudgetRate ?? ""),
      highGmvThreshold: String(mapped.specialHighThreshold ?? commissionConfig.special?.highGmvThreshold ?? ""),
      highGmvServiceRate: String(mapped.specialHighServiceRate ?? commissionConfig.special?.highGmvServiceRate ?? ""),
    };
  }
  const primaryRate = primaryRateFromCommissionConfig(commissionConfig);

  // 重算缺失的必填字段：以最终落库值为准（模板派生的 commissionType、AI 识别的
  // feeCycle 等已算作已填）。仅这些缺失才强制补填，其余字段未识别可忽略。
  const canonicalMapped: Record<string, unknown> = {
    ...mapped,
    commissionType: templateKey,
    commissionRate: primaryRate ?? mapped.commissionRate,
    commissionConfig: stringifyCommissionConfig(commissionConfig),
    thresholdCurrency: commissionConfig.threshold?.currency ?? mapped.thresholdCurrency,
    thresholdAmount: commissionConfig.threshold?.amount ?? mapped.thresholdAmount,
    thresholdReachedRate: commissionConfig.threshold?.reachedRate ?? mapped.thresholdReachedRate,
    thresholdUnreachedRate: commissionConfig.threshold?.unreachedRate ?? mapped.thresholdUnreachedRate,
  };
  const finalMappedError = validateMappedContractFields(canonicalMapped);
  if (finalMappedError) return { ok: false, error: finalMappedError };
  const persistedMapped = contractCreateFields(canonicalMapped);
  const requiredFields = uploadRequiredFields(uploadArchiveMode, templateKey);
  const missing = requiredFields.filter((f) => {
    const v = canonicalMapped[f.key];
    return valueMissing(v);
  });
  const needsTemplate = !resolvedTemplateId;
  // 上传识别只负责预填。即使全部字段均已识别，也必须进入与常规创建一致的
  // 表单，由员工核对并明确确认后才创建已签署合同。
  if (!finalizeUpload) {
    return {
      ok: true,
      data: {
        contractId: null,
        missing,
        autoSubmitted: false,
        archived: false,
        needsTemplate,
        needsSupplement: true,
        fields: canonicalMapped,
        sourceTextPreview: text,
        sourcePreviewHtml,
        sourceFileType: ext,
        detectedTemplateKey,
      },
    };
  }

  if (needsTemplate) return { ok: false, error: "请选择适用的合同模板后再确认" };
  if (missing.length > 0) {
    const missingLabels = missing.map((field) => `「${field.label}」`).join("、");
    return {
      ok: false,
      error: `仍有 ${missing.length} 个关键字段未补齐：${missingLabels}。请补齐后再确认`,
    };
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
          status: "COMPLETED",
          uploadType: "EXISTING",
          uploadArchiveMode,
          fillMethod: "AI_EXTRACT",
          extractedBy: "AI",
          templateId: resolvedTemplateId,
          partyBCompany,
          ownerId,
          reviewerId,
          contractText: text || "PDF 未包含可提取的文字层，字段由创建人手动补齐。",
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

  await ensureCustomerReconciliationPlan(contract.id, session.userId);

  const base = contractFileBaseName({
    contractNo: contract.contractNo,
    createdAt: new Date(),
    partyA: typeof mapped.partyA === "string" ? mapped.partyA : null,
    customer,
  });
  const savedName = `${base}-${contract.id}-v1.${ext}`;
  const { fileUrl } = await writePrivateContractFile("contracts-generated", savedName, buf);

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

  const archived = true;
  await syncContractProgressToProjects(contract.id, "签署完成");
  await bumpCustomerStatus(customerId, "COOPERATING");
  const autoSubmitted = false;

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
      fields: canonicalMapped,
      sourceTextPreview: text,
      sourcePreviewHtml,
      sourceFileType: ext,
      detectedTemplateKey,
    },
  };
}

export async function getUploadRequiredFields() {
  const session = await requireSession();
  await requireFeaturePermission(session, "contracts.create_upload", "EDIT");
  return uploadRequiredFields("SIGNED_ARCHIVE");
}
