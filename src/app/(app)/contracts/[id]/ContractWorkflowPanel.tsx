"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Send, Upload, RefreshCw, FileDown, X, History, AlertCircle, Stamp,
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
  hasTemplate,
  hasGeneratedDoc,
  pendingNewUpload,
  stampStatus,
  stampedDocUrl,
  isAdmin,
  versions,
}: {
  contractId: string;
  status: string;
  hasTemplate: boolean;
  hasGeneratedDoc: boolean;
  pendingNewUpload: boolean;
  stampStatus: string;
  stampedDocUrl: string | null;
  isAdmin: boolean;
  versions: ContractVersionRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const r = await generateContractFromTemplate(contractId, "手动重新生成");
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  }

  function doStamp() {
    setError(null);
    if (!confirm("确认对当前最新版本进行盖章？将转 PDF 并每页右下贴公章，作为归档版本。")) return;
    startTransition(async () => {
      const r = await stampContract(contractId);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  }
  const canStamp = isAdmin && (status === "SIGNING" || status === "COMPLETED");

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">合同流程</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            生成合同 → 提交审核（沿用当前 / 上传新版） → 审核通过 → 盖章归档
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === "IN_PROGRESS" && hasTemplate && (
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
          {status === "IN_PROGRESS" && (
            <button
              type="button"
              onClick={() => setShowSubmit(true)}
              disabled={pending}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Send className="h-4 w-4" /> 提交审核
            </button>
          )}
          {canStamp && stampStatus !== "STAMPED" && (
            <button
              type="button"
              onClick={doStamp}
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
                    <a
                      href={v.fileUrl}
                      download
                      className="flex shrink-0 items-center gap-1 rounded bg-brand-50 px-2 py-1 text-[11px] text-brand-700 hover:bg-brand-100"
                    >
                      <FileDown className="h-3 w-3" /> 下载
                    </a>
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
  const [path, setPath] = useState<"current" | "upload">(hasGeneratedDoc ? "current" : "upload");
  const [file, setFile] = useState<File | null>(null);

  function submit() {
    setError(null);
    if (path === "current") {
      startTransition(async () => {
        const r = await submitForReviewUseCurrent(contractId);
        if (!r.ok) { setError(r.error); return; }
        onSaved();
      });
    } else {
      if (!file) { setError("请选择文件"); return; }
      const fd = new FormData();
      fd.append("contractId", contractId);
      fd.append("file", file);
      startTransition(async () => {
        const r = await submitForReviewUploadNew(fd);
        if (!r.ok) { setError(r.error); return; }
        onSaved();
      });
    }
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

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setPath("current")}
            disabled={!hasGeneratedDoc}
            className={`flex w-full items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              path === "current"
                ? "border-brand-500 bg-brand-50"
                : "border-slate-200 hover:border-brand-300"
            }`}
          >
            <Send className="mt-0.5 h-4 w-4 text-brand-600" />
            <div>
              <p className="font-semibold text-slate-800">沿用当前合同</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {hasGeneratedDoc
                  ? "用当前已生成/上传的版本直接推送审核，无需重新抽取字段。"
                  : "本合同尚未生成任何版本，请先生成或选用「上传新版」。"}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPath("upload")}
            className={`flex w-full items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
              path === "upload"
                ? "border-brand-500 bg-brand-50"
                : "border-slate-200 hover:border-brand-300"
            }`}
          >
            <Upload className="mt-0.5 h-4 w-4 text-brand-600" />
            <div>
              <p className="font-semibold text-slate-800">上传新版合同</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                替换为外部修改过的 .docx；提交后会标记为"待重抽字段"，审核人重新识别后再确认。
              </p>
            </div>
          </button>
        </div>

        {path === "upload" && (
          <div className="mt-3">
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30">
              <Upload className="h-4 w-4 text-slate-400" />
              <span className="text-xs text-slate-500">
                {file ? file.name : "点击选择 .docx（最大 20MB）"}
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
