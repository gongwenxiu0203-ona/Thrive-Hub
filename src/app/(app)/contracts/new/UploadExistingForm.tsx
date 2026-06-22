"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { uploadExistingContract } from "@/actions/contractUpload";

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
  const [success, setSuccess] = useState<{
    contractId: string;
    missing: { key: string; label: string }[];
    autoSubmitted: boolean;
  } | null>(null);

  const [customerId, setCustomerId] = useState(presetCustomerId ?? "");
  const [contractNoPrefix, setNoPrefix] = useState<"LYNQ" | "THRAIVE">("THRAIVE");
  const [type, setType] = useState<"BRAND" | "CHANNEL" | "REBATE">("BRAND");
  const [templateId, setTemplateId] = useState("");
  const [partyBCompany, setPartyBCompany] = useState<"THRAIVE" | "LINGYUE" | "">("THRAIVE");
  const [ownerId, setOwnerId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function submit() {
    setError(null);
    if (!customerId) { setError("请选择关联客户"); return; }
    if (!file) { setError("请选择合同 .docx 文件"); return; }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("customerId", customerId);
      fd.append("contractNoPrefix", contractNoPrefix);
      fd.append("type", type);
      if (templateId) fd.append("templateId", templateId);
      if (partyBCompany) fd.append("partyBCompany", partyBCompany);
      if (ownerId) fd.append("ownerId", ownerId);
      fd.append("file", file);
      const r = await uploadExistingContract(fd);
      if (!r.ok) { setError(r.error); return; }
      setSuccess(r.data!);
    });
  }

  if (success) {
    return (
      <SuccessView
        contractId={success.contractId}
        missing={success.missing}
        autoSubmitted={success.autoSubmitted}
        onGoToContract={() => router.push(`/contracts/${success.contractId}`)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <Section title="基础信息">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="关联客户" required>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="input"
              >
                <option value="">选择客户…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.brandName}</option>
                ))}
              </select>
            </Field>
            <Field label="合同类型" required>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="input"
              >
                <option value="BRAND">品牌方合同</option>
                <option value="CHANNEL">渠道商合同</option>
                <option value="REBATE">返佣合同</option>
              </select>
            </Field>
            <Field label="合同编号前缀">
              <select
                value={contractNoPrefix}
                onChange={(e) => setNoPrefix(e.target.value as typeof contractNoPrefix)}
                className="input"
              >
                <option value="THRAIVE">THRAIVE-</option>
                <option value="LYNQ">LYNQ-</option>
              </select>
            </Field>
            <Field label="合同负责人（可选，默认本人）">
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="input"
              >
                <option value="">本人</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
            <Field label="乙方公司">
              <select
                value={partyBCompany}
                onChange={(e) => setPartyBCompany(e.target.value as typeof partyBCompany)}
                className="input"
              >
                <option value="THRAIVE">THRAIVE</option>
                <option value="LINGYUE">灵跃</option>
              </select>
            </Field>
            <Field label="适用模板（可选）">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="input"
              >
                <option value="">不绑定模板</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="上传合同 .docx">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 hover:border-brand-400 hover:bg-brand-50/30">
            <Upload className="h-5 w-5 text-slate-400" />
            <span className="text-sm text-slate-600">
              {file ? file.name : "点击选择已签或待签的 .docx 合同"}
            </span>
            <span className="text-[11px] text-slate-400">系统将自动识别甲方信息、费用、佣金等关键字段（最大 25MB）</span>
            <input
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </Section>

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Upload className="h-4 w-4" />
            {pending ? "上传并识别中…" : "上传并识别字段"}
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
  onGoToContract,
}: {
  contractId: string;
  missing: { key: string; label: string }[];
  autoSubmitted: boolean;
  onGoToContract: () => void;
}) {
  return (
    <div className="card p-6 space-y-4">
      {missing.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">上传成功</p>
            <p className="mt-1 text-sm text-emerald-700">
              所有关键字段均已识别。
              {autoSubmitted ? "合同已自动推送给审核人。" : "合同已保存为草稿，请到详情页手动提交审核。"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">上传成功，但有 {missing.length} 个关键字段需要补填</p>
            <p className="mt-1 text-sm text-amber-700">
              请去合同详情页填写以下字段后再提交审核：
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-amber-700">
              {missing.map((m) => (
                <li key={m.key} className="rounded bg-amber-100/60 px-2 py-1">
                  · {m.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onGoToContract}
          className="btn-primary text-sm"
        >
          {missing.length === 0 ? "查看合同" : "去补填字段"}
        </button>
      </div>
      <p className="text-[11px] text-slate-400">合同 ID：{contractId}</p>
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
