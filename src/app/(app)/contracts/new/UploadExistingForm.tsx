"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { uploadExistingContract } from "@/actions/contractUpload";

const CURRENCY_CHOICES = ["美金", "人民币", "欧元", "英镑"];
const CYCLE_CHOICES = ["月度", "季度"];
const FEE_CYCLE_CHOICES = ["月付", "季度预付"];

const PERCENT_KEYS = new Set([
  "commissionRate",
  "thresholdReachedRate",
  "thresholdUnreachedRate",
  "excessCommissionRate",
]);

const LONG_TEXT_KEYS = new Set(["tieredRules", "specialCommissionTerms"]);

export interface UploadExistingFormProps {
  customers: { id: string; brandName: string }[];
  users: { id: string; name: string }[];
  templates: { id: string; name: string; templateKey: string }[];
  presetCustomerId?: string;
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
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function confirmSupplement(overrides: Record<string, string>, nextTemplateId: string) {
    setError(null);
    if (!file) { setError("原始文件已丢失，请重新选择合同文件"); return; }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("customerId", customerId);
      fd.append("contractNoPrefix", contractNoPrefix);
      fd.append("type", type);
      if (nextTemplateId) fd.append("templateId", nextTemplateId);
      if (partyBCompany) fd.append("partyBCompany", partyBCompany);
      if (ownerId) fd.append("ownerId", ownerId);
      fd.append("uploadArchiveMode", "SIGNED_ARCHIVE");
      fd.append("finalizeUpload", "1");
      for (const [key, value] of Object.entries(overrides)) {
        fd.append(`override:${key}`, value);
      }
      fd.append("file", file);
      const r = await uploadExistingContract(fd);
      if (!r.ok) { setError(r.error); return; }
      setTemplateId(nextTemplateId);
      setSuccess(r.data!);
    });
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
  templateId: string;
  pending: boolean;
  error: string | null;
  onConfirmSupplement: (overrides: Record<string, string>, nextTemplateId: string) => void;
  onGoToContract: () => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templateId);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of missing) {
      const value = fields[field.key];
      initial[field.key] = Array.isArray(value) ? value.join(",") : String(value ?? "");
    }
    return initial;
  });
  const partyBComparison = readRecord(fields.__partyBComparison);
  const paymentAccounts = readRecordArray(fields.__paymentAccounts);

  if (needsSupplement) {
    return (
      <div className="card space-y-5 p-6">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">识别完成，需要先补齐字段</p>
            <p className="mt-1 text-sm text-amber-700">
              系统尚未创建合同记录。请对照原文补齐缺失字段，确认后才会创建合同并按所选用途归档或送审。
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-slate-600">原文对照</p>
            <SourcePreview
              file={sourceFile}
              fileType={sourceFileType}
              html={sourcePreviewHtml}
              text={sourceTextPreview}
            />
          </div>

          <div className="space-y-3">
            <ReadonlyComparisonCard
              title="乙方信息原文对照（只读）"
              description="仅用于核对上传合同原文，不会覆盖系统内乙方公司与账户配置。"
              rows={[
                ["乙方公司", partyBComparison.company],
                ["统一社会信用代码/商业登记号", partyBComparison.creditCode],
                ["乙方地址", partyBComparison.address],
                ["乙方指定联系人", partyBComparison.contact],
                ["电话", partyBComparison.phone],
                ["电子邮箱", partyBComparison.email],
              ]}
            />
            <PaymentAccountsCard accounts={paymentAccounts} />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                适用模板 <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="input"
              >
                <option value="">请选择适用的合同模板</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.templateKey === detectedTemplateKey ? "（识别匹配）" : ""}
                  </option>
                ))}
              </select>
              {needsTemplate && (
                <p className="mt-1 text-[11px] text-sky-600">
                  识别到佣金方式：{detectedTemplateKey}，但未匹配到模板，请手动选择。
                </p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600">待补填字段</p>
              {missing.map((field) => (
                <SupplementFieldInput
                  key={field.key}
                  field={field}
                  value={overrides[field.key] ?? ""}
                  onChange={(value) => setOverrides((prev) => ({ ...prev, [field.key]: value }))}
                />
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => window.location.reload()} className="btn-secondary text-sm">
            重新上传
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirmSupplement(overrides, selectedTemplateId)}
            className="btn-primary text-sm"
          >
            {pending ? "确认中..." : "补齐并创建合同"}
          </button>
        </div>
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
    return (
      <div>
        {commonLabel}
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">请选择币种</option>
          {CURRENCY_CHOICES.map((currency) => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </select>
      </div>
    );
  }

  if (key === "feeCycle") {
    return (
      <div>
        {commonLabel}
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">请选择固费支付周期</option>
          {FEE_CYCLE_CHOICES.map((cycle) => (
            <option key={cycle} value={cycle}>{cycle}</option>
          ))}
        </select>
      </div>
    );
  }

  if (key === "gmvSettlementCycle") {
    return (
      <div>
        {commonLabel}
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">请选择 GMV 结算周期</option>
          {CYCLE_CHOICES.map((cycle) => (
            <option key={cycle} value={cycle}>{cycle}</option>
          ))}
        </select>
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
