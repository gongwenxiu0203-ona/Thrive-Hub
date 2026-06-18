"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download, Trash2, Plus, X, FileText, FolderOpen, Stamp } from "lucide-react";
import {
  uploadContractTemplate,
  deleteContractTemplate,
} from "@/actions/contractTemplates";
import { TEMPLATE_KEY_LABELS, TEMPLATE_KEYS } from "@/lib/contractTemplateKeys";
import { uploadSeal } from "@/actions/contractStamp";
import { formatDate } from "@/lib/utils";

export interface TemplateRow {
  id: string;
  name: string;
  templateKey: string;
  templateKeyLabel: string;
  fileUrl: string;
  description: string | null;
  uploaderName: string;
  createdAt: string;
}

export function TemplatesClient({
  isAdmin,
  hasSeal,
  templates,
}: {
  isAdmin: boolean;
  hasSeal: boolean;
  templates: TemplateRow[];
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Group by templateKey
  const grouped = TEMPLATE_KEYS.map((k) => ({
    key: k,
    label: TEMPLATE_KEY_LABELS[k],
    items: templates.filter((t) => t.templateKey === k),
  }));
  const uncategorized = templates.filter((t) => !TEMPLATE_KEYS.includes(t.templateKey));
  if (uncategorized.length > 0) {
    grouped.push({ key: "OTHER", label: "其他", items: uncategorized });
  }

  function remove(id: string, name: string) {
    if (!confirm(`确认删除模板「${name}」？已使用此模板的合同不受影响。`)) return;
    startTransition(async () => {
      const r = await deleteContractTemplate(id);
      if (!r.ok) { alert(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div>
      {isAdmin && <SealUploadCard hasSeal={hasSeal} />}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {templates.length === 0
            ? "暂无模板，等待管理员上传"
            : `共 ${templates.length} 个模板，按佣金机制分组`}
        </p>
        {isAdmin && (
          <button
            onClick={() => setUploadOpen(true)}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus className="h-4 w-4" /> 上传新模板
          </button>
        )}
      </div>

      <div className="space-y-5">
        {grouped.map((g) => (
          <div key={g.key} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-semibold text-slate-800">{g.label}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {g.items.length}
                </span>
              </div>
            </div>
            {g.items.length === 0 ? (
              <p className="text-xs text-slate-400">该机制暂无模板</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/40 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{t.name}</p>
                        {t.description && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                            {t.description}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-slate-400">
                          {t.uploaderName} · {formatDate(new Date(t.createdAt))}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1">
                      <a
                        href={t.fileUrl}
                        download={`${t.name}.docx`}
                        className="flex items-center gap-1 rounded bg-brand-50 px-2 py-1 text-[11px] text-brand-700 hover:bg-brand-100"
                      >
                        <Download className="h-3 w-3" /> 下载
                      </a>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => remove(t.id, t.name)}
                          disabled={pending}
                          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" /> 删除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSaved={() => {
            setUploadOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function UploadModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // 受控 file 字段：避免 display:none 在部分浏览器里被 FormData 漏掉，
  // 同时给用户可见的"已选文件"反馈
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputId = "contract-template-file";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.currentTarget.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".docx")) {
      setFile(null);
      setError("仅支持 .docx 文件");
      e.currentTarget.value = "";
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      setFile(null);
      setError("文件超过 20MB");
      e.currentTarget.value = "";
      return;
    }
    setError(null);
    setFile(selected);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("请填写模板名称"); return; }
    if (!templateKey) { setError("请选择佣金机制类型"); return; }
    if (!file) { setError("请选择 .docx 文件"); return; }
    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("templateKey", templateKey);
    fd.append("description", description);
    fd.append("file", file);
    startTransition(async () => {
      const r = await uploadContractTemplate(fd);
      if (!r.ok) { setError(r.error); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="card w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">上传合同模板</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-slate-100"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">模板名称 <span className="text-rose-500">*</span></label>
            <input
              className="input"
              placeholder="如：0616 亚马逊基础月费·全量·固佣"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">佣金机制类型 <span className="text-rose-500">*</span></label>
            <select
              className="input"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              required
            >
              <option value="" disabled>请选择…</option>
              {TEMPLATE_KEYS.map((k) => (
                <option key={k} value={k}>{TEMPLATE_KEY_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">备注（可选）</label>
            <textarea
              rows={2}
              className="input"
              placeholder="模板适用场景或差异说明"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label">.docx 文件 <span className="text-rose-500">*</span></label>
            <input
              id={fileInputId}
              name="file"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              className="sr-only"
            />
            <label
              htmlFor={fileInputId}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                file
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/30"
              }`}
            >
              <Upload className="h-4 w-4 text-slate-400" />
              {file ? (
                <>
                  <span className="max-w-full truncate text-xs font-medium text-emerald-700">{file.name}</span>
                  <span className="text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB · 点击可重新选择</span>
                </>
              ) : (
                <span className="text-xs text-slate-500">点击选择文件（最大 20MB）</span>
              )}
            </label>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            取消
          </button>
          <button type="submit" disabled={pending || !file} className="btn-primary flex items-center gap-1 text-sm disabled:cursor-not-allowed disabled:opacity-50">
            <Upload className="h-4 w-4" /> {pending ? "上传中…" : "上传"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SealUploadCard({ hasSeal }: { hasSeal: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setNote(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const r = await uploadSeal(fd);
      if (!r.ok) { setError(r.error); return; }
      setNote("✅ 公章已更新");
      setPreviewKey((k) => k + 1);
      router.refresh();
    });
    if (e.target) e.target.value = "";
  }

  return (
    <div className="card mb-5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Stamp className="h-5 w-5 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-slate-800">公章 PNG（自动盖章用）</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              透明背景 PNG，建议 ≥ 300×300px；自动盖章时按每页右下贴章。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasSeal ? (
            <img
              key={previewKey}
              src={`/seal/thraive-seal.png?v=${previewKey}`}
              alt="公章预览"
              className="h-12 w-12 rounded border border-slate-200 bg-slate-50 object-contain p-1"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">
              未上传
            </div>
          )}
          <label className="btn-secondary flex items-center gap-1.5 cursor-pointer text-sm">
            <Upload className="h-4 w-4" />
            {pending ? "上传中…" : hasSeal ? "更换公章" : "上传公章"}
            <input type="file" accept=".png" className="hidden" onChange={onFile} disabled={pending} />
          </label>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-rose-600">{error}</p>
      )}
      {note && !error && (
        <p className="mt-2 text-xs text-emerald-600">{note}</p>
      )}
    </div>
  );
}
