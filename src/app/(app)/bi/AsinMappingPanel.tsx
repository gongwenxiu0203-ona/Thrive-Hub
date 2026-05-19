"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, UploadCloud, AlertCircle } from "lucide-react";

type Mapping = {
  id: string;
  brand: string;
  store: string;
  region: string;
  asin: string;
  parentAsin: string | null;
  storeProductLabel: string | null;
  createdAt: string;
};

export function AsinMappingPanel({
  mappings,
  total,
}: {
  mappings: Mapping[];
  total: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/asin-mapping/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "上传失败");
      } else {
        const skipped =
          data.skipped?.length > 0
            ? `，跳过 ${data.skipped.length} 行` : "";
        setDone(
          `成功导入 ${data.upserted} 条映射，已回填 ${data.backfilled} 条销售记录${skipped}`,
        );
        router.refresh();
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <section className="card p-5">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onFile}
      />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">
            Parent ASIN / 链接标签 匹配
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            上传映射表，按
            <span className="mx-1 rounded bg-slate-100 px-1 text-xs">
              品牌 + 店铺 + 地区 + ASIN
            </span>
            作为唯一键匹配推广数据，将「父 ASIN / 链接标签」补足到销售记录中。已存在的记录会被回填。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/asin-mapping/template"
            className="btn-secondary"
          >
            <Download className="h-4 w-4" /> 下载模板
          </a>
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud className="h-4 w-4" />
            {pending ? "上传中…" : "上传映射表"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {done && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
          {done}
        </p>
      )}

      <p className="mb-2 text-xs text-slate-500">
        已有映射 <b>{total}</b> 条（展示最近 {mappings.length} 条）
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>品牌</th>
              <th>店铺</th>
              <th>地区</th>
              <th>ASIN</th>
              <th>父 ASIN</th>
              <th>链接标签</th>
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  暂无映射数据
                </td>
              </tr>
            ) : (
              mappings.map((m) => (
                <tr key={m.id}>
                  <td>{m.brand}</td>
                  <td>{m.store}</td>
                  <td>{m.region}</td>
                  <td>{m.asin}</td>
                  <td>{m.parentAsin ?? "—"}</td>
                  <td>{m.storeProductLabel ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
