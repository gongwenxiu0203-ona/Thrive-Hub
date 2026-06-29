"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Upload, RefreshCw, FileDown, X, History, AlertCircle, Stamp, ExternalLink,
} from "lucide-react";
import {
  generateContractFromTemplate,
  submitForReviewUseCurrent,
  submitForReviewUploadNew,
} from "@/actions/contractWorkflow";
import { stampContract } from "@/actions/contractStamp";
import { formatDate } from "@/lib/utils";

export interface ContractVersionRow {
  id: string;
  versionNo: number;
  fileUrl: string;
  fileType: string;
  reason: string;
  createdByName: string;
  createdAt: string;
}

export function ContractWorkflowPanel({
  contractId,
  status,
  archived = false,
  hasTemplate,
  hasGeneratedDoc,
  pendingNewUpload,
  hasSourceAnnotations,
  stampStatus,
  stampedDocUrl,
  isAdmin,
  versions,
}: {
  contractId: string;
  status: string;
  archived?: boolean;
  hasTemplate: boolean;
  hasGeneratedDoc: boolean;
  pendingNewUpload: boolean;
  hasSourceAnnotations: boolean;
  stampStatus: string;
  stampedDocUrl: string | null;
  isAdmin: boolean;
  versions: ContractVersionRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showStamp, setShowStamp] = useState(false);

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const r = await generateContractFromTemplate(contractId, "手动重新生成");
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  }

  function doStamp(sealCompany: "FOSHAN" | "HONGKONG") {
    setError(null);
    startTransition(async () => {
      const r = await stampContract(contractId, sealCompany);
      if (!r.ok) { setError(r.error); return; }
      setShowStamp(false);
      router.refresh();
    });
  }
  const canStamp = isAdmin && !archived && (status === "SIGNING" || status === "COMPLETED");

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">合同流程</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {archived
              ? "签署完成存档：合同已直接归档，无需生成 / 审核 / 盖章。"
              : "生成合同 → 提交审核（沿用当前 / 上传新版） → 审核通过 → 盖章归档"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!archived && (status === "IN_PROGRESS" || status === "REJECTED") && hasTemplate && (
            <button
              type="button"
              onClick={regenerate}
              disabled={pending}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              {hasGeneratedDoc ? "重新生成" : "生成合同 DOCX"}
            </button>
          )}
          {!archived && (status === "IN_PROGRESS" || status === "REJECTED") && (
            <button
              type="button"
              onClick={() => setShowSubmit(true)}
              disabled={pending}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Send className="h-4 w-4" />
              {status === "REJECTED" ? "重新提交审核" : "提交审核"}
            </button>
          )}
          {canStamp && stampStatus !== "STAMPED" && (
            <button
              type="button"
              onClick={() => setShowStamp(true)}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <Stamp className="h-4 w-4" /> 自动盖章
            </button>
          )}
          {stampStatus === "STAMPED" && stampedDocUrl && (
            <a
              href={stampedDocUrl}
              download
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <FileDown className="h-4 w-4" /> 下载已盖章归档 PDF
            </a>
          )}
        </div>
      </div>

      {!hasTemplate && status === "IN_PROGRESS" && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            本合同未绑定模板，无法自动生成 DOCX。请在
            <a href="/contracts/templates" className="mx-1 underline">模板库</a>
            上传/选择适用模板，然后在合同编辑页选择该模板。
          </p>
        </div>
      )}
      {pendingNewUpload && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>本合同上传了新版本，等待审核人重新识别字段。</p>
        </div>
      )}
      {status === "REJECTED" && hasSourceAnnotations && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>合同已退回，原文中有审核批注待查看，请先查看原文批注和字段意见后再修改提交。</p>
        </div>
      )}
      {stampStatus === "FAILED" && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            上次盖章失败。请确认服务器已安装 LibreOffice、公章 PNG 已上传，然后重试。
          </p>
        </div>
      )}
      {stampStatus === "STAMPED" && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
          <Stamp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>本合同已盖章并归档；后续如需重新盖章，请先做新版本。</p>
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">
          {error}
        </div>
      )}

      {/* Versions timeline */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <History className="h-3.5 w-3.5" />
          版本历史（共 {versions.length} 版）
        </div>
        {versions.length === 0 ? (
          <p className="text-xs text-slate-400">暂无版本。生成或上传合同后将自动记录。</p>
        ) : (
          <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
            {versions.map((v) => (
              <li key={v.id} className="relative">
                <span className="absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                  v{v.versionNo}
                </span>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{v.reason}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {v.createdByName} · {formatDate(new Date(v.createdAt))} · {v.fileType.toUpperCase()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={`/api/contracts/version-download/${v.id}?inline=1`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                      >
                        <ExternalLink className="h-3 w-3" /> 在线查看
                      </a>
                      <a
                        href={`/api/contracts/version-download/${v.id}`}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="flex items-center gap-1 rounded bg-brand-50 px-2 py-1 text-[11px] text-brand-700 hover:bg-brand-100"
                      >
                        <FileDown className="h-3 w-3" /> 下载
                      </a>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {showSubmit && (
        <SubmitReviewModal
          contractId={contractId}
          hasGeneratedDoc={hasGeneratedDoc}
          onClose={() => setShowSubmit(false)}
          onSaved={() => {
            setShowSubmit(false);
            router.refresh();
          }}
        />
      )}
      {showStamp && (
        <StampCompanyModal
          pending={pending}
          onClose={() => setShowStamp(false)}
          onConfirm={doStamp}
        />
      )}
    </section>
  );
}

function SubmitReviewModal({
  contractId,
  hasGeneratedDoc,
  onClose,
  onSaved,
}: {
  contractId: string;
  hasGeneratedDoc: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [termsChanged, setTermsChanged] = useState<"no" | "yes" | null>(null);
  const [file, setFile] = useState<File | null>(null);

  function submit() {
    setError(null);
    if (!termsChanged) { setError("请先确认合同条款是否有修改"); return; }
    if (termsChanged === "no") {
      if (!hasGeneratedDoc) { setError("请先生成一份合同文件"); return; }
      startTransition(async () => {
        const r = await submitForReviewUseCurrent(contractId);
        if (!r.ok) { setError(r.error); return; }
        onSaved();
      });
      return;
    }
    if (!file) { setError("合同条款有修改时，必须上传新的合同 DOCX"); return; }
    const fd = new FormData();
    fd.append("contractId", contractId);
    fd.append("file", file);
    startTransition(async () => {
      const r = await submitForReviewUploadNew(fd);
      if (!r.ok) { setError(r.error); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">提交审核</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-4">
          <ChoiceGroup
            title="合同条款是否有修改？"
            description="例如正文条款、补充条款、项目确认书文字有人工调整。字段修改请先在合同编辑页保存后再提交。"
            value={termsChanged}
            onChange={setTermsChanged}
          />
          {termsChanged === "yes" && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              条款已修改，必须上传新版 DOCX。提交后审核人会看到“合同条款有修改，请重点查看”的提示。
            </div>
          )}
          {termsChanged === "no" && !hasGeneratedDoc && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              当前还没有生成合同文件，请先关闭弹窗并生成合同 DOCX。
            </div>
          )}
        </div>

        {termsChanged === "yes" && (
          <div className="mt-3">
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30">
              <Upload className="h-4 w-4 text-slate-400" />
              <span className="text-xs text-slate-500">
                {file ? file.name : "点击选择新版 .docx（最大 20MB）"}
              </span>
              <input
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="btn-primary flex items-center gap-1 text-sm"
          >
            <Send className="h-4 w-4" /> {pending ? "提交中…" : "确认提交"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChoiceGroup({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: "no" | "yes" | null;
  onChange: (value: "no" | "yes") => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {([
          ["no", "没有修改"],
          ["yes", "有修改"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              value === key
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600 hover:border-brand-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StampCompanyModal({
  pending,
  onClose,
  onConfirm,
}: {
  pending: boolean;
  onClose: () => void;
  onConfirm: (sealCompany: "FOSHAN" | "HONGKONG") => void;
}) {
  const [sealCompany, setSealCompany] = useState<"FOSHAN" | "HONGKONG">("FOSHAN");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">选择盖章公司</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          系统会用当前最新合同版本生成盖章 PDF，并保存为新的归档版本。
        </p>
        <div className="space-y-2">
          {([
            ["FOSHAN", "佛山公司"],
            ["HONGKONG", "香港公司"],
          ] as const).map(([key, label]) => (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                sealCompany === key
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              <input
                type="radio"
                className="accent-rose-600"
                checked={sealCompany === key}
                onChange={() => setSealCompany(key)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            取消
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm(sealCompany)}
            className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            <Stamp className="h-4 w-4" /> {pending ? "盖章中…" : "确认盖章"}
          </button>
        </div>
      </div>
    </div>
  );
}
