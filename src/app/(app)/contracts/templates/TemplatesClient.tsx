"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download, Trash2, Plus, X, FileText, FolderOpen } from "lucide-react";
import {
  uploadContractTemplate,
  deleteContractTemplate,
  TEMPLATE_KEY_LABELS,
  TEMPLATE_KEYS,
} from "@/actions/contractTemplates";
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
  templates,
}: {
  isAdmin: boolean;
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

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
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
              name="name"
              className="input"
              placeholder="如：0616 亚马逊基础月费·全量·固佣"
              required
            />
          </div>
          <div>
            <label className="label">佣金机制类型 <span className="text-rose-500">*</span></label>
            <select name="templateKey" className="input" required defaultValue="">
              <option value="" disabled>请选择…</option>
              {TEMPLATE_KEYS.map((k) => (
                <option key={k} value={k}>{TEMPLATE_KEY_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">备注（可选）</label>
            <textarea
              name="description"
              rows={2}
              className="input"
              placeholder="模板适用场景或差异说明"
            />
          </div>
          <div>
            <label className="label">.docx 文件 <span className="text-rose-500">*</span></label>
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30">
              <Upload className="h-4 w-4 text-slate-400" />
              <span className="text-xs text-slate-500">点击选择文件（最大 20MB）</span>
              <input type="file" name="file" accept=".docx" required className="hidden" />
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
          <button type="submit" disabled={pending} className="btn-primary flex items-center gap-1 text-sm">
            <Upload className="h-4 w-4" /> {pending ? "上传中…" : "上传"}
          </button>
        </div>
      </form>
    </div>
  );
}
