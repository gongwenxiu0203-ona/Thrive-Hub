"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download, FileSpreadsheet, ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CUSTOMER_IMPORT_FIELDS } from "@/lib/customerImport";

type ParseResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  suggestedMapping: Record<string, string>;
};

export function CustomerImportModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function reset() {
    setStep(1);
    setParsed(null);
    setMapping({});
    setError(null);
    setDone(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/customers/parse", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "解析失败");
      } else {
        setParsed(data);
        setMapping(data.suggestedMapping);
        setStep(2);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function confirmImport() {
    if (!parsed) return;
    if (!mapping.brandName) {
      setError("「品牌/店铺名称」为必填字段，请先选择对应的表格列");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows, mapping }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "导入失败");
        return;
      }
      const skippedNote =
        data.skipped?.length > 0
          ? `，跳过 ${data.skipped.length} 行（品牌名称为空）`
          : "";
      setDone(`成功导入 ${data.imported} 条客户${skippedNote}`);
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> 批量导入
      </button>

      <Modal open={open} onClose={close} title="批量导入客户" wide>
        {/* step indicator */}
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              step === 1
                ? "bg-brand-600 text-white"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            1
          </span>
          <span className={step === 1 ? "text-slate-800" : "text-slate-400"}>
            上传文件
          </span>
          <span className="text-slate-300">—</span>
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              step === 2 ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"
            }`}
          >
            2
          </span>
          <span className={step === 2 ? "text-slate-800" : "text-slate-400"}>
            确认字段映射
          </span>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-emerald-600">{done}</p>
            <button className="btn-primary mt-4" onClick={close}>
              完成
            </button>
          </div>
        ) : step === 1 ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onFile}
            />
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center">
              <FileSpreadsheet className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                上传客户数据表（Excel / CSV）
              </p>
              <p className="mt-1 text-xs text-slate-400">
                首行需为表头。上传后可在下一步手动调整每个字段的映射关系。
              </p>
              <div className="mt-4 flex gap-2">
                <a
                  href="/api/customers/export?template=1"
                  className="btn-secondary"
                >
                  <Download className="h-4 w-4" /> 下载导入模板
                </a>
                <button
                  className="btn-primary"
                  disabled={pending}
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {pending ? "解析中…" : "选择文件"}
                </button>
              </div>
            </div>
            {error && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
                <p className="font-medium">导入失败</p>
                <p className="mt-0.5 text-xs">{error}</p>
              </div>
            )}
          </div>
        ) : (
          parsed && (
            <div>
              <p className="mb-3 text-sm text-slate-500">
                已读取 <b>{parsed.rowCount}</b> 行数据、
                {parsed.columns.length} 个列。请确认下方每个系统字段对应的表格列，
                可任意手动调整；选择「— 不导入 —」则该字段留空。
              </p>
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
                <table className="data w-full">
                  <thead>
                    <tr>
                      <th>系统字段</th>
                      <th>对应表格列</th>
                      <th>数据预览</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CUSTOMER_IMPORT_FIELDS.map((field) => {
                      const col = mapping[field.key] ?? "";
                      const preview = col
                        ? String(parsed.rows[0]?.[col] ?? "")
                        : "";
                      return (
                        <tr key={field.key}>
                          <td className="font-medium text-slate-700">
                            {field.label}
                            {field.required && (
                              <span className="ml-1 text-rose-500">*</span>
                            )}
                          </td>
                          <td>
                            <select
                              className={`input ${
                                field.required && !col
                                  ? "border-rose-400"
                                  : ""
                              }`}
                              value={col}
                              onChange={(e) =>
                                setMapping((m) => ({
                                  ...m,
                                  [field.key]: e.target.value,
                                }))
                              }
                            >
                              <option value="">— 不导入 —</option>
                              {parsed.columns.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="max-w-[12rem] truncate text-xs text-slate-400">
                            {preview || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  {error}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setStep(1);
                    setError(null);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" /> 重新上传
                </button>
                <button
                  className="btn-primary"
                  disabled={pending}
                  onClick={confirmImport}
                >
                  {pending ? "导入中…" : `确认导入 ${parsed.rowCount} 条`}
                </button>
              </div>
            </div>
          )
        )}
      </Modal>
    </>
  );
}
