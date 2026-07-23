"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import type { Result, UploadExistingContractData } from "@/actions/contractUpload";
import { ContractV4Form } from "./ContractV4Form";
import type { ContractV4Payload } from "@/actions/contracts";
import { cn } from "@/lib/utils";
import {
  CONTRACT_FEE_CURRENCIES,
  CONTRACT_FEE_CYCLES,
  CONTRACT_GMV_CYCLES,
  CONTRACT_COOP_CHANNELS,
  CONTRACT_STANDARD_PLATFORMS,
  CONTRACT_TARGET_SITES,
} from "@/lib/contractFormOptions";
import { CURRENCY_OPTIONS } from "@/lib/contractCommissionConfig";

const PERCENT_KEYS = new Set([
  "commissionRate",
  "thresholdReachedRate",
  "thresholdUnreachedRate",
  "excessCommissionRate",
  "specialAttributionRate",
  "specialCreatorRate",
  "specialTotalCommissionRate",
  "specialSalesCommissionRate",
  "specialLowBudgetRate",
  "specialHighServiceRate",
]);

const LONG_TEXT_KEYS = new Set(["tieredRules", "specialCommissionTerms"]);

const SUPPLEMENT_GROUPS = [
  { title: "甲方信息", fields: [
    ["partyA", "甲方签约主体公司名称"], ["partyACreditCode", "统一社会信用代码"],
    ["partyAAddress", "甲方地址"], ["partyAContact", "甲方指定联系人"],
    ["partyAPhone", "联系电话"], ["partyAEmail", "电子邮箱"],
  ] },
  { title: "合作信息", fields: [
    ["promoPlatform", "销售平台 / 推广平台"], ["targetSite", "目标站点"],
    ["startDate", "合作开始日期"], ["endDate", "合作结束日期"],
    ["taxType", "税费类型"], ["taxBearer", "税费承担方"],
  ] },
  { title: "固定服务费", fields: [
    ["feeCurrency", "月度服务费货币"], ["feeAmount", "月度服务费金额"], ["feeCycle", "固费支付周期"],
  ] },
  { title: "GMV 佣金", fields: [
    ["commissionRate", "GMV抽佣比例"], ["thresholdCurrency", "GMV门槛币种"],
    ["thresholdAmount", "GMV门槛金额"], ["thresholdReachedRate", "达标后抽佣比例"],
    ["thresholdUnreachedRate", "未达标抽佣比例"], ["excessBaseMonths", "基准月数"],
    ["excessCommissionRate", "超额增长部分佣金比例"], ["specialCommissionTerms", "特殊佣金规则"],
    ["specialTotalCommissionRate", "总包佣金"], ["specialSalesCommissionRate", "销售佣金比例"],
    ["specialGmvCurrency", "特殊佣金GMV门槛货币"], ["specialAttributionRate", "Attribution渠道佣金比例"],
    ["specialCreatorRate", "Creator Connections佣金比例"], ["specialLowThreshold", "低GMV门槛"],
    ["specialLowBudgetRate", "低GMV推广预算比例"], ["specialHighThreshold", "高GMV门槛"],
    ["specialHighServiceRate", "高GMV服务佣金比例"],
    ["gmvSettlementCycle", "GMV结算周期"],
  ] },
] as const;

type ProductRow = { name: string; asin: string; price: string; trackLink: string };
type TierRow = { from: string; to: string; rate: string };

export interface UploadExistingFormProps {
  customers: { id: string; brandName: string }[];
  users: { id: string; name: string }[];
  templates: { id: string; name: string; templateKey: string }[];
  presetCustomerId?: string;
}

function uploadRequestError(error: unknown): string {
  console.error("[contract-upload] request failed", error);
  return "上传识别请求失败，请检查网络后重试。文件仍保留在当前页面，无需重新选择。";
}

async function uploadExistingContract(fd: FormData): Promise<Result<UploadExistingContractData>> {
  const response = await fetch("/api/contracts/upload-existing", {
    method: "POST",
    body: fd,
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Unexpected upload response (${response.status})`);
  }
  const result = await response.json() as Result<UploadExistingContractData>;
  if (!response.ok && result.ok) {
    throw new Error(`Upload request failed (${response.status})`);
  }
  return result;
}

export function UploadExistingForm({
  customers,
  users,
  templates,
  presetCustomerId,
}: UploadExistingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [success, setSuccess] = useState<{
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
  } | null>(null);

  const [customerId, setCustomerId] = useState(presetCustomerId ?? "");
  const [contractNoPrefix, setNoPrefix] = useState<"LYNQ" | "THRAIVE">("THRAIVE");
  const [type, setType] = useState<"BRAND" | "CHANNEL" | "REBATE">("BRAND");
  const [templateId, setTemplateId] = useState("");
  const [partyBCompany, setPartyBCompany] = useState<"THRAIVE" | "LINGYUE" | "">("THRAIVE");
  const [ownerId, setOwnerId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function submit() {
    if (submittingRef.current) return;
    setError(null);
    if (!customerId) { setError("请选择关联客户"); return; }
    if (!file) { setError("请选择合同 Word/PDF 文件"); return; }
    submittingRef.current = true;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("customerId", customerId);
        fd.append("contractNoPrefix", contractNoPrefix);
        fd.append("type", type);
        if (templateId) fd.append("templateId", templateId);
        if (partyBCompany) fd.append("partyBCompany", partyBCompany);
        if (ownerId) fd.append("ownerId", ownerId);
        fd.append("uploadArchiveMode", "SIGNED_ARCHIVE");
        fd.append("file", file);
        const r = await uploadExistingContract(fd);
        if (!r.ok) { setError(r.error); return; }
        setSuccess(r.data!);
      } catch (error) {
        setError(uploadRequestError(error));
      } finally {
        submittingRef.current = false;
      }
    });
  }

  async function confirmSupplement(overrides: Record<string, string>, nextTemplateId: string) {
    setError(null);
    if (!file) {
      const message = "原始文件已丢失，请重新选择合同文件";
      setError(message);
      return { ok: false as const, error: message };
    }
    const fd = new FormData();
    fd.append("customerId", overrides.customerId || customerId);
    fd.append("contractNoPrefix", contractNoPrefix);
    fd.append("type", overrides.type || type);
    if (nextTemplateId) fd.append("templateId", nextTemplateId);
    if (overrides.partyBCompany || partyBCompany) fd.append("partyBCompany", overrides.partyBCompany || partyBCompany);
    if (overrides.ownerId || ownerId) fd.append("ownerId", overrides.ownerId || ownerId);
    if (overrides.reviewerId) fd.append("reviewerId", overrides.reviewerId);
    fd.append("uploadArchiveMode", "SIGNED_ARCHIVE");
    fd.append("finalizeUpload", "1");
    for (const [key, value] of Object.entries(overrides)) {
      fd.append(`override:${key}`, value);
    }
    fd.append("file", file);
    try {
      const r = await uploadExistingContract(fd);
      if (!r.ok) {
        setError(r.error);
        return { ok: false as const, error: r.error };
      }
      setTemplateId(nextTemplateId);
      setSuccess(r.data!);
      return { ok: true as const, contractId: r.data?.contractId ?? undefined };
    } catch (error) {
      const message = uploadRequestError(error);
      setError(message);
      return { ok: false as const, error: message };
    }
  }

  if (success) {
    return (
      <SuccessView
        contractId={success.contractId}
        missing={success.missing}
        autoSubmitted={success.autoSubmitted}
        archived={success.archived}
        needsTemplate={success.needsTemplate}
        needsSupplement={success.needsSupplement}
        fields={success.fields}
        sourceTextPreview={success.sourceTextPreview}
        sourcePreviewHtml={success.sourcePreviewHtml}
        sourceFileType={success.sourceFileType}
        sourceFile={file}
        detectedTemplateKey={success.detectedTemplateKey}
        templates={templates}
        customers={customers}
        users={users}
        customerId={customerId}
        contractType={type}
        ownerId={ownerId}
        partyBCompany={partyBCompany}
        templateId={templateId}
        pending={pending}
        error={error}
        onConfirmSupplement={confirmSupplement}
        onGoToContract={() => {
          if (success.contractId) router.push(`/contracts/${success.contractId}`);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-5">
        <Section title="基础信息">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="关联客户" required>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input">
                <option value="">选择客户</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.brandName}</option>
                ))}
              </select>
            </Field>
            <Field label="合同类型" required>
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input">
                <option value="BRAND">品牌方合同</option>
                <option value="CHANNEL">渠道商合同</option>
                <option value="REBATE">返佣合同</option>
              </select>
            </Field>
            <Field label="合同编号前缀">
              <select value={contractNoPrefix} onChange={(e) => setNoPrefix(e.target.value as typeof contractNoPrefix)} className="input">
                <option value="THRAIVE">THRAIVE-</option>
                <option value="LYNQ">LYNQ-</option>
              </select>
            </Field>
            <Field label="合同负责人（可选，默认本人）">
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input">
                <option value="">本人</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
            <Field label="乙方公司">
              <select value={partyBCompany} onChange={(e) => setPartyBCompany(e.target.value as typeof partyBCompany)} className="input">
                <option value="THRAIVE">THRAIVE</option>
                <option value="LINGYUE">灵跃</option>
              </select>
            </Field>
            <Field label="适用模板（可选）">
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input">
                <option value="">不绑定模板，由合同内容识别</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="上传用途">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-800">签署完成存档</p>
            <p className="mt-1 text-xs text-emerald-700">系统读取 Word/PDF 的文字内容并映射合同字段；缺失字段补齐后才会创建并归档。</p>
          </div>
        </Section>

        <Section title="上传合同 Word/PDF">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 hover:border-brand-400 hover:bg-brand-50/30">
            <Upload className="h-5 w-5 text-slate-400" />
            <span className="text-sm text-slate-600">
              {file ? file.name : "点击选择已签或待签的 Word/PDF 合同"}
            </span>
            <span className="text-[11px] text-slate-400">系统会识别甲方、合作、推广、费用和佣金等字段（最大 25MB）</span>
            <input
              type="file"
              accept=".docx,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </Section>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={pending || submittingRef.current} className="btn-primary flex items-center gap-1.5 text-sm">
            <Upload className="h-4 w-4" />
            {pending ? "上传并识别中..." : "上传并识别字段"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessView({
  contractId,
  missing,
  autoSubmitted,
  archived,
  needsTemplate,
  needsSupplement,
  fields,
  sourceTextPreview,
  sourcePreviewHtml,
  sourceFileType,
  sourceFile,
  detectedTemplateKey,
  templates,
  customers,
  users,
  customerId,
  contractType,
  ownerId,
  partyBCompany,
  templateId,
  pending,
  error,
  onConfirmSupplement,
  onGoToContract,
}: {
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
  sourceFile: File | null;
  detectedTemplateKey: string;
  templates: { id: string; name: string; templateKey: string }[];
  customers: { id: string; brandName: string }[];
  users: { id: string; name: string }[];
  customerId: string;
  contractType: string;
  ownerId: string;
  partyBCompany: string;
  templateId: string;
  pending: boolean;
  error: string | null;
  onConfirmSupplement: (overrides: Record<string, string>, nextTemplateId: string) => Promise<{
    ok: boolean;
    error?: string;
    contractId?: string;
  }>;
  onGoToContract: () => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templateId);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const group of SUPPLEMENT_GROUPS) {
      for (const [key] of group.fields) {
        const value = fields[key];
        initial[key] = Array.isArray(value) || (value && typeof value === "object")
          ? JSON.stringify(value)
          : String(value ?? "");
      }
    }
    for (const key of ["tieredRules", "coopChannels", "productList", "partyBBankAccounts"]) {
      const value = fields[key];
      initial[key] = Array.isArray(value) || (value && typeof value === "object")
        ? JSON.stringify(value)
        : String(value ?? "");
    }
    return initial;
  });
  const activeTemplateKey = templates.find((item) => item.id === selectedTemplateId)?.templateKey
    ?? detectedTemplateKey;
  const editableFields = SUPPLEMENT_GROUPS.flatMap((group) => group.fields.map(([key, label]) => ({ key, label })));
  const partyBComparison = readRecord(fields.__partyBComparison);
  const paymentAccounts = readRecordArray(fields.__paymentAccounts);

  if (needsSupplement) {
    const matchedTemplateId = selectedTemplateId
      || templates.find((item) => item.templateKey === detectedTemplateKey)?.id
      || "";
    // AI providers occasionally return multi-value fields as arrays even
    // though the regular contract form consumes comma-separated strings.
    // Normalize the upload boundary so ContractV4Form never calls `.split`
    // on an array and crashes the client after a successful extraction.
    const formText = (value: unknown) => Array.isArray(value)
      ? value.map((item) => String(item ?? "").trim()).filter(Boolean).join(",")
      : String(value ?? "");
    const initialContract = {
      ...fields,
      promoPlatform: formText(fields.promoPlatform),
      targetSite: formText(fields.targetSite),
      coopChannels: typeof fields.coopChannels === "string"
        ? fields.coopChannels
        : JSON.stringify(Array.isArray(fields.coopChannels) ? fields.coopChannels : []),
      productList: typeof fields.productList === "string"
        ? fields.productList
        : JSON.stringify(Array.isArray(fields.productList) ? fields.productList : []),
      partyBBankAccounts: typeof fields.partyBBankAccounts === "string"
        ? fields.partyBBankAccounts
        : JSON.stringify(Array.isArray(fields.partyBBankAccounts) ? fields.partyBBankAccounts : []),
      customerId,
      type: contractType,
      ownerId,
      templateId: matchedTemplateId,
      partyBCompany,
      commissionType: detectedTemplateKey || fields.commissionType || "",
    };
    const submitRecognizedContract = async (payload: ContractV4Payload) => {
      const mapped: Record<string, string> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (value == null) continue;
        mapped[key === "partyAName" ? "partyA" : key] = String(value);
      }
      return onConfirmSupplement(mapped, payload.templateId ?? "");
    };
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">识别完成，需要先补齐字段</p>
            <p className="mt-1 text-sm text-amber-700">
              系统尚未创建合同记录。识别到的内容已自动填入下方表单；未识别字段保持为空，按创建合同相同的规则补齐后才会创建并归档。
            </p>
          </div>
        </div>
        <ContractV4Form
          customers={customers}
          users={users}
          templates={templates}
          presetCustomerId={customerId}
          presetCustomerName={customers.find((item) => item.id === customerId)?.brandName}
          existingContract={initialContract}
          uploadSubmit={submitRecognizedContract}
        />
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-6">
      {needsTemplate && (
        <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
          <div>
            <p className="text-sm font-semibold text-sky-800">未能自动识别适用模板</p>
            <p className="mt-1 text-sm text-sky-700">系统未能按佣金结算方式自动匹配到模板，请到合同详情页手动选择适用模板（必填）。</p>
          </div>
        </div>
      )}
      {missing.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">上传成功</p>
            <p className="mt-1 text-sm text-emerald-700">
              所有关键字段均已识别。
              {archived ? " 合同已作为签署完成件归档。" : autoSubmitted ? " 合同已自动推送给审核人。" : " 合同已保存，请在详情页手动提交审核。"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">上传成功，但有 {missing.length} 个关键字段需要补填</p>
            <p className="mt-1 text-sm text-amber-700">请到合同详情页补齐字段后再提交审核或确认归档。</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-amber-700">
              {missing.map((m) => (
                <li key={m.key} className="rounded bg-amber-100/60 px-2 py-1">· {m.label}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onGoToContract} className="btn-primary text-sm">
          {missing.length === 0 ? "查看合同" : "去补填字段"}
        </button>
      </div>
      {contractId && <p className="text-[11px] text-slate-400">合同 ID：{contractId}</p>}
    </div>
  );
}

function ReadonlyComparisonCard({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<[string, unknown]>;
}) {
  const visibleRows = rows.filter(([, value]) => String(value ?? "").trim());
  if (visibleRows.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2">
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {visibleRows.map(([label, value]) => (
          <div key={label} className="rounded-md bg-white px-2 py-1.5">
            <p className="text-[11px] text-slate-400">{label}</p>
            <p className="break-words text-xs text-slate-700">{String(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcePreview({
  file,
  fileType,
  html,
  text,
}: {
  file: File | null;
  fileType: "docx" | "pdf";
  html: string;
  text: string;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (fileType !== "pdf" || !file) {
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, fileType]);

  if (fileType === "pdf" && pdfUrl) {
    return (
      <div className="space-y-2">
        <iframe
          src={pdfUrl}
          title="PDF 原文对照"
          className="h-[620px] w-full rounded-lg border border-slate-200 bg-white"
        />
        <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            查看系统抽取文本
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">
            {text || "未识别到可展示的原文内容"}
          </pre>
        </details>
      </div>
    );
  }

  if (html) {
    return (
      <iframe
        srcDoc={html}
        title="Word 原文对照"
        sandbox=""
        className="h-[620px] w-full rounded-lg border border-slate-200 bg-white"
      />
    );
  }

  return (
    <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
      {text || "未识别到可展示的原文内容"}
    </pre>
  );
}

function PaymentAccountsCard({ accounts }: { accounts: Record<string, unknown>[] }) {
  if (accounts.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2">
        <p className="text-xs font-semibold text-slate-700">乙方收款账户原文识别（只读）</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          系统会识别一个或两个收款账户；不完整账户标记为待确认，不会自动覆盖系统账户。
        </p>
      </div>
      <div className="space-y-2">
        {accounts.map((account, index) => (
          <div key={index} className="rounded-md bg-white p-2 text-xs text-slate-700">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium">
                {accountLabel(account.companyType)}{account.usage ? ` · ${account.usage}` : ""}
              </span>
              <span className={account.status === "COMPLETE" ? "text-emerald-600" : "text-amber-600"}>
                {account.status === "COMPLETE" ? "完整" : "待确认"}
              </span>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              <AccountCell label="账户名称" value={account.accountName} />
              <AccountCell label="开户银行" value={account.bankName} />
              <AccountCell label="银行账号" value={account.bankAccountNo} />
              <AccountCell label="SWIFT CODE" value={account.swiftCode} />
            </div>
            {account.rawText ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-slate-400">查看账户上下文</summary>
                <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] leading-4 text-slate-500">
                  {String(account.rawText)}
                </pre>
              </details>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountCell({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <span className="text-slate-400">{label}：</span>
      <span>{String(value ?? "未识别")}</span>
    </div>
  );
}

function accountLabel(value: unknown): string {
  if (value === "FOSHAN") return "佛山公司账户";
  if (value === "HONGKONG") return "香港公司账户";
  return "收款账户";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function parseJsonArray<T>(value: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

function CoopChannelEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = parseJsonArray<string>(value, value.split(/[,，]/).map((item) => item.trim()).filter(Boolean));
  const toggle = (key: string) => onChange(JSON.stringify(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]));
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold text-slate-700">合作渠道（可多选）</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CONTRACT_COOP_CHANNELS.map((channel) => (
          <label key={channel.key} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", selected.includes(channel.key) ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600")}>
            <input type="checkbox" checked={selected.includes(channel.key)} onChange={() => toggle(channel.key)} />
            {channel.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function BankAccountEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = parseJsonArray<string>(value, []);
  const options = [{ key: "FOSHAN", label: "佛山公司账户" }, { key: "HONGKONG", label: "香港公司账户" }];
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold text-slate-700">乙方收款账户（可多选）</p>
      <div className="flex flex-wrap gap-2">{options.map((account) => <label key={account.key} className={cn("cursor-pointer rounded-lg border px-3 py-2 text-sm", selected.includes(account.key) ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600")}><input className="mr-2" type="checkbox" checked={selected.includes(account.key)} onChange={() => onChange(JSON.stringify(selected.includes(account.key) ? selected.filter((item) => item !== account.key) : [...selected, account.key]))} />{account.label}</label>)}</div>
    </div>
  );
}

function TierEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  let currency = "USD";
  let rows: TierRow[] = [{ from: "0", to: "", rate: "" }];
  try { const parsed = JSON.parse(value || "{}"); currency = String(parsed.currency || "USD"); if (Array.isArray(parsed.tiers) && parsed.tiers.length) rows = parsed.tiers; } catch { /* editable fallback */ }
  const commit = (nextRows: TierRow[], nextCurrency = currency) => onChange(JSON.stringify({ currency: nextCurrency, tiers: nextRows }));
  return <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3"><p className="text-xs font-semibold text-slate-700">阶梯佣金规则</p><select className="input max-w-xs" value={currency} onChange={(e) => commit(rows, e.target.value)}>{CURRENCY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{rows.map((row, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"><input className="input" value={row.from} placeholder="起始 GMV" onChange={(e) => commit(rows.map((item, i) => i === index ? { ...item, from: e.target.value } : item))} /><input className="input" value={row.to} placeholder="结束 GMV（留空=以上）" onChange={(e) => commit(rows.map((item, i) => i === index ? { ...item, to: e.target.value } : item))} /><input className="input" value={row.rate} placeholder="佣金比例 %" onChange={(e) => commit(rows.map((item, i) => i === index ? { ...item, rate: e.target.value.replace(/[^0-9.]/g, "") } : item))} /><button type="button" className="btn-secondary text-xs" disabled={rows.length === 1} onClick={() => commit(rows.filter((_, i) => i !== index))}>删除</button></div>)}<button type="button" className="btn-secondary text-xs" onClick={() => commit([...rows, { from: "", to: "", rate: "" }])}>+ 新增阶梯</button></div>;
}

function ProductEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const rows = parseJsonArray<ProductRow>(value, [{ name: "", asin: "", price: "", trackLink: "" }]);
  const normalized = rows.length ? rows : [{ name: "", asin: "", price: "", trackLink: "" }];
  const commit = (next: ProductRow[]) => onChange(JSON.stringify(next));
  return <div className="space-y-3 rounded-lg border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-700">推广商品清单</p>{normalized.map((row, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1.4fr_auto]">{([['name','商品名称'],['asin','ASIN'],['price','零售价'],['trackLink','优惠码或追踪链接']] as const).map(([key, placeholder]) => <input key={key} className="input" value={row[key] ?? ""} placeholder={placeholder} onChange={(e) => commit(normalized.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item))} />)}<button type="button" className="btn-secondary text-xs" disabled={normalized.length === 1} onClick={() => commit(normalized.filter((_, i) => i !== index))}>删除</button></div>)}<button type="button" className="btn-secondary text-xs" onClick={() => commit([...normalized, { name: "", asin: "", price: "", trackLink: "" }])}>+ 新增商品</button></div>;
}

function SupplementFieldInput({
  field,
  value,
  onChange,
}: {
  field: { key: string; label: string };
  value: string;
  onChange: (value: string) => void;
}) {
  const key = field.key;
  const commonLabel = (
    <label className="mb-1 block text-xs font-medium text-slate-600">{field.label}</label>
  );

  if (key === "startDate" || key === "endDate") {
    return (
      <div>
        {commonLabel}
        <input
          type="date"
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (key === "feeCurrency" || key === "thresholdCurrency") {
    const currencies = key === "feeCurrency"
      ? CONTRACT_FEE_CURRENCIES.map((currency) => ({ value: currency, label: currency }))
      : CURRENCY_OPTIONS;
    return (
      <div>
        {commonLabel}
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">请选择币种</option>
          {currencies.map((currency) => (
            <option key={currency.value} value={currency.value}>{currency.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (key === "taxType" || key === "specialGmvCurrency") {
    const choices = key === "taxType"
      ? ["不含税", "含税"]
      : CURRENCY_OPTIONS.map((item) => item.value);
    return <div>{commonLabel}<select className="input" value={value} onChange={(e) => onChange(e.target.value)}><option value="">请选择</option>{choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select></div>;
  }

  if (key === "feeCycle") {
    return (
      <div>
        {commonLabel}
        <ChoicePills choices={CONTRACT_FEE_CYCLES} value={value} onChange={onChange} tone="brand" />
      </div>
    );
  }

  if (key === "gmvSettlementCycle") {
    return (
      <div>
        {commonLabel}
        <ChoicePills choices={CONTRACT_GMV_CYCLES} value={value} onChange={onChange} tone="amber" />
      </div>
    );
  }

  if (key === "promoPlatform") {
    return (
      <div>
        {commonLabel}
        <MultiChoiceWithOther
          choices={CONTRACT_STANDARD_PLATFORMS}
          value={value}
          onChange={onChange}
          otherPlaceholder="其他平台（手动填写）"
        />
      </div>
    );
  }

  if (key === "targetSite") {
    return (
      <div>
        {commonLabel}
        <MultiChoiceWithOther
          choices={CONTRACT_TARGET_SITES}
          value={value}
          onChange={onChange}
          otherPlaceholder="其他站点（手动填写）"
        />
      </div>
    );
  }

  if (PERCENT_KEYS.has(key)) {
    return (
      <div>
        {commonLabel}
        <div className="relative">
          <input
            className="input pr-7"
            inputMode="decimal"
            value={value.replace(/%/g, "")}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={`请输入${field.label}`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
        </div>
      </div>
    );
  }

  if (LONG_TEXT_KEYS.has(key)) {
    return (
      <div>
        {commonLabel}
        <textarea
          className="input min-h-[110px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${field.label}`}
        />
      </div>
    );
  }

  return (
    <div>
      {commonLabel}
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`请输入${field.label}`}
      />
    </div>
  );
}

function ChoicePills({
  choices,
  value,
  onChange,
  tone,
}: {
  choices: readonly string[];
  value: string;
  onChange: (value: string) => void;
  tone: "brand" | "amber";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((choice) => {
        const selected = value === choice;
        return (
          <button
            key={choice}
            type="button"
            onClick={() => onChange(choice)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              selected && tone === "brand" && "border-brand-500 bg-brand-50 text-brand-700",
              selected && tone === "amber" && "border-amber-500 bg-amber-50 text-amber-700",
              !selected && "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            {choice}
          </button>
        );
      })}
    </div>
  );
}

function MultiChoiceWithOther({
  choices,
  value,
  onChange,
  otherPlaceholder,
}: {
  choices: readonly string[];
  value: string;
  onChange: (value: string) => void;
  otherPlaceholder: string;
}) {
  const values = value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  const selected = values.filter((item) => choices.includes(item as never));
  const other = values.find((item) => !choices.includes(item as never)) ?? "";

  function commit(nextSelected: string[], nextOther: string) {
    onChange([...nextSelected, nextOther.trim()].filter(Boolean).join(", "));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {choices.map((choice) => {
        const active = selected.includes(choice);
        return (
          <button
            key={choice}
            type="button"
            onClick={() => commit(
              active ? selected.filter((item) => item !== choice) : [...selected, choice],
              other,
            )}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            {choice}
          </button>
        );
      })}
      <input
        className="input h-[34px] w-44 text-sm"
        value={other}
        onChange={(event) => commit(selected, event.target.value)}
        placeholder={otherPlaceholder}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
