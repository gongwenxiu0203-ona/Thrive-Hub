"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clipboard, FileText, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export type MediaKitItem = {
  id: string;
  attachmentId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  text: string;
  error?: string;
  createdAt: string;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(item: MediaKitItem) {
  return item.fileType.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(item.fileName);
}

export default function AffiliateMediaKitPanel({
  affiliateId,
  initialItems,
}: {
  affiliateId: string;
  initialItems: MediaKitItem[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaKitItem[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

  async function uploadFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/affiliates/${affiliateId}/media-kit`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "上传失败");
    setItems((prev) => [data.item, ...prev]);
  }

  function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setMessage(null);
    startTransition(async () => {
      try {
        for (const file of list) {
          await uploadFile(file);
        }
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "上传失败");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(e.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (files.length > 0) {
      e.preventDefault();
      uploadFiles(files);
    }
  }

  function saveText(itemId: string) {
    startTransition(async () => {
      const res = await fetch(`/api/affiliates/${affiliateId}/media-kit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, text: editing[itemId] ?? "" }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((item) => item.id === itemId ? { ...item, text: editing[itemId] ?? "" } : item));
        setEditing((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        router.refresh();
      }
    });
  }

  function deleteItem(itemId: string) {
    startTransition(async () => {
      const res = await fetch(`/api/affiliates/${affiliateId}/media-kit?itemId=${itemId}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== itemId));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.md,image/*"
        onChange={(e) => e.target.files && uploadFiles(e.target.files)}
      />
      <div
        tabIndex={0}
        onPaste={handlePaste}
        className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 focus:border-brand-400 focus:bg-white focus:outline-none"
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {pending ? "处理中..." : "上传附件"}
          </button>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Clipboard className="h-3.5 w-3.5" />
            可直接粘贴多张图片；PDF/Word/txt 会自动提取文字
          </span>
        </div>
        {message && <p className="mt-2 text-xs text-rose-600">{message}</p>}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
          暂无 rate card / media kit 附件
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const image = isImage(item);
            const draft = editing[item.id] ?? item.text;
            const isEditing = item.id in editing;
            return (
              <div key={item.id} className="rounded-lg border border-slate-100 bg-white p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500">
                    {image ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm font-medium text-slate-800 hover:text-brand-600 hover:underline"
                    >
                      {item.fileName}
                    </a>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {humanSize(item.fileSize)} · {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => deleteItem(item.id)}
                    className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {image ? (
                  <p className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-400">
                    图片已上传，不进行文字识别
                  </p>
                ) : (
                  <div className="mt-2">
                    {item.error && (
                      <p className="mb-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">{item.error}</p>
                    )}
                    <textarea
                      className="input min-h-[92px] text-xs"
                      value={draft}
                      placeholder="未识别到文字，可手动补充"
                      onChange={(e) => setEditing((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                    {isEditing && (
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn-outline text-xs"
                          onClick={() => setEditing((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          })}
                        >
                          取消
                        </button>
                        <button type="button" className="btn-primary text-xs" disabled={pending} onClick={() => saveText(item.id)}>
                          保存文字
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
