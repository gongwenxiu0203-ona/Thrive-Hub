"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

export function AffiliateImportBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/affiliates/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error ?? "导入失败");
      else {
        const note = data.warnings > 0 ? `，${data.warnings} 个疑似重复` : "";
        setMsg(`成功导入 ${data.created} 个联盟商${note}`);
        router.refresh();
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onFile}
      />
      <button
        className="btn-secondary"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" /> {pending ? "导入中…" : "批量导入"}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}
