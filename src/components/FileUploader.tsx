"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Download, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { clientUnknownError, readApiError } from "@/lib/clientError";

export type AttachmentItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  createdAt: string | Date;
  uploadedBy?: { name: string } | null;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileUploader({
  entityType,
  entityId,
  attachments,
  label = "上传文件",
}: {
  entityType: string;
  entityId: string;
  attachments: AttachmentItem[];
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entityType", entityType);
        fd.append("entityId", entityId);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          setError(await readApiError(res));
          return;
        }
        router.refresh();
      } catch (uploadError) {
        console.error("[attachment-upload]", uploadError);
        setError(clientUnknownError());
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function onDelete(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/upload?id=${id}`, { method: "DELETE" });
        if (!res.ok) {
          setError(await readApiError(res));
          return;
        }
        router.refresh();
      } catch (deleteError) {
        console.error("[attachment-delete]", deleteError);
        setError(clientUnknownError());
      }
    });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onFile}
      />
      <button
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" />
        {pending ? "上传中…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {attachments.length > 0 && (
        <ul className="mt-3 space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-700">{a.fileName}</p>
                <p className="text-xs text-slate-400">
                  {humanSize(a.fileSize)} ·{" "}
                  {a.uploadedBy?.name ?? "—"} ·{" "}
                  {formatDateTime(a.createdAt)}
                </p>
              </div>
              <a
                href={a.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={() => onDelete(a.id)}
                disabled={pending}
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
