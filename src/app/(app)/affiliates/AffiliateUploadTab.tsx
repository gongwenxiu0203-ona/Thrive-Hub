"use client";

import { useState, useRef, useEffect } from "react";
import {
  Download, Upload, AlertTriangle, CheckCircle2,
  UserCheck, Trash2, RefreshCw, ChevronDown, Search,
} from "lucide-react";
import { UPLOADABLE_AFFILIATE_FIELDS } from "@/lib/affiliateFields";

interface UploadResult {
  row: number;
  status: "created" | "merged" | "duplicate_warning";
  name: string;
  duplicateOf?: string;
  mergedFields?: string[];
}

interface BatchRecord {
  id: string;
  fileName: string;
  recordCount: number;
  createdAt: string;
  uploader: { id: string; name: string };
}

interface Props {
  users: { id: string; name: string }[];
  onComplete?: () => void;
}

// ── Multi-select searchable dropdown ──────────────────────────────────────────
function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { id: string; name: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(q.toLowerCase()),
  );

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const selectedNames = value
    .map((id) => options.find((o) => o.id === id)?.name)
    .filter(Boolean)
    .join("、");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input text-sm flex items-center justify-between w-full text-left"
      >
        <span className={value.length === 0 ? "text-slate-400" : "text-slate-800"}>
          {value.length === 0 ? placeholder ?? "请选择" : selectedNames}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索…"
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">无匹配选项</p>
            )}
            {filtered.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={value.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="text-sm text-slate-700">{o.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Searchable single select ──────────────────────────────────────────────────
function SearchSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(q.toLowerCase()),
  );

  const selectedName = options.find((o) => o.id === value)?.name;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input text-sm flex items-center justify-between w-full text-left"
      >
        <span className={!value ? "text-slate-400" : "text-slate-800"}>
          {selectedName ?? placeholder ?? "请选择"}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索…"
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">无匹配选项</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${value === o.id ? "text-brand-700 font-medium" : "text-slate-700"}`}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AffiliateUploadTab({ users, onComplete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ created: number; merged: number; warnings: number; results: UploadResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Batch management
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);

  // Bulk assign
  const [picOptions, setPicOptions] = useState<{ id: string; name: string }[]>([]);
  const [fromOwners, setFromOwners] = useState<string[]>([]);
  const [toOwner, setToOwner] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<string | null>(null);

  // Data cleanup
  const [cleanupMode, setCleanupMode] = useState<"before_date" | "no_contact" | "by_status">("before_date");
  const [cleanupDate, setCleanupDate] = useState("");
  const [cleanupStatus, setCleanupStatus] = useState("");
  const [cleanupPreviewCount, setCleanupPreviewCount] = useState<number | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    loadBatches();
    loadPicOptions();
  }, []);

  async function loadBatches() {
    setBatchesLoading(true);
    try {
      const res = await fetch("/api/affiliates/batches");
      const data = await res.json();
      setBatches(data);
    } catch { /* ignore */ }
    finally { setBatchesLoading(false); }
  }

  async function loadPicOptions() {
    try {
      const res = await fetch("/api/affiliates/pic-options");
      const data = await res.json();
      setPicOptions(data);
    } catch { /* ignore */ }
  }

  async function deleteBatch(id: string) {
    if (!confirm("确定要删除该批次及其所有联盟商数据吗？此操作不可撤销。")) return;
    setDeletingBatch(id);
    try {
      await fetch(`/api/affiliates/batches/${id}`, { method: "DELETE" });
      setBatches((bs) => bs.filter((b) => b.id !== id));
    } catch { /* ignore */ }
    finally { setDeletingBatch(null); }
  }

  async function doAssign() {
    if (!toOwner || fromOwners.length === 0) return;
    setAssigning(true);
    setAssignResult(null);
    try {
      const res = await fetch("/api/affiliates/bulk-assign-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromPersonInChargeIds: fromOwners,
          toPersonInChargeId: toOwner,
        }),
      });
      const data = await res.json();
      setAssignResult(`已更新 ${data.updated} 条联盟商记录`);
      loadPicOptions(); // refresh options
    } catch {
      setAssignResult("操作失败，请重试");
    } finally {
      setAssigning(false);
    }
  }

  async function doCleanupPreview() {
    setCleanupLoading(true);
    setCleanupPreviewCount(null);
    setCleanupResult(null);
    try {
      const res = await fetch("/api/affiliates/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: cleanupMode,
          date: cleanupDate || undefined,
          status: cleanupStatus || undefined,
          preview: true,
        }),
      });
      const data = await res.json();
      setCleanupPreviewCount(data.count);
    } catch {
      setCleanupResult("预览失败，请重试");
    } finally {
      setCleanupLoading(false);
    }
  }

  async function doCleanup() {
    if (cleanupPreviewCount === null) return;
    if (!confirm(`确定要删除 ${cleanupPreviewCount} 条联盟商数据吗？此操作不可撤销。`)) return;
    setCleanupLoading(true);
    setCleanupResult(null);
    try {
      const res = await fetch("/api/affiliates/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: cleanupMode,
          date: cleanupDate || undefined,
          status: cleanupStatus || undefined,
          preview: false,
        }),
      });
      const data = await res.json();
      setCleanupResult(`已删除 ${data.deleted} 条联盟商数据`);
      setCleanupPreviewCount(null);
    } catch {
      setCleanupResult("清理失败，请重试");
    } finally {
      setCleanupLoading(false);
    }
  }

  async function handleFile(f: File) {
    setFile(f);
    setError(null);
    const { read, utils } = await import("xlsx");
    const buf = await f.arrayBuffer();
    const wb = read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: string[][] = utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
    const hdrs = (rows[0] ?? []).map((h) => String(h).trim());
    setHeaders(hdrs);

    const auto: Record<number, string> = {};
    for (let ci = 0; ci < hdrs.length; ci++) {
      const h = hdrs[ci].toLowerCase();
      for (const field of UPLOADABLE_AFFILIATE_FIELDS) {
        if (field.label.toLowerCase() === h || field.key.toLowerCase() === h) {
          auto[ci] = field.key;
          break;
        }
      }
    }
    setMapping(auto);
    setStep(2);
  }

  async function doUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      const res = await fetch("/api/affiliates/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data);
      setStep(3);
      loadBatches(); // refresh batch list
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setFile(null);
    setHeaders([]);
    setMapping({});
    setStep(1);
    setResults(null);
    setError(null);
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Step header */}
      <div className="flex items-center gap-3">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step >= s ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"}`}>{s}</div>
            <span className={`text-sm ${step >= s ? "text-slate-800" : "text-slate-400"}`}>
              {s === 1 ? "选择文件" : s === 2 ? "字段映射" : "导入结果"}
            </span>
            {s < 3 && <div className="ml-1 h-px w-8 bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Download template */}
      <div className="card p-4 flex items-center gap-4">
        <div>
          <p className="text-sm font-medium text-slate-800">下载导入模板</p>
          <p className="text-xs text-slate-500">模板包含所有字段和格式说明，请按模板格式填写数据</p>
        </div>
        <a
          href="/api/affiliates/template"
          download
          className="ml-auto flex items-center gap-1.5 rounded border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
        >
          <Download className="h-4 w-4" />
          下载模板
        </a>
      </div>

      {step === 1 && (
        <div
          className="card flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 hover:border-brand-400"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <Upload className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">点击或拖拽上传 Excel / CSV 文件</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="card p-4">
            <p className="mb-3 text-sm font-medium text-slate-800">
              文件: <span className="text-brand-700">{file?.name}</span> — 检测到 {headers.length} 列
            </p>
            <p className="mb-3 text-xs text-slate-500">请为每列选择对应的系统字段（已自动匹配，可手动调整）</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="py-2 pr-4 text-left font-medium">文件列名</th>
                    <th className="py-2 text-left font-medium">映射到系统字段</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, ci) => (
                    <tr key={ci} className="border-b border-slate-50">
                      <td className="py-1.5 pr-4 text-slate-600">{h || `(列 ${ci + 1})`}</td>
                      <td className="py-1.5">
                        <select
                          value={mapping[ci] ?? ""}
                          onChange={(e) => setMapping((m) => ({ ...m, [ci]: e.target.value }))}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="">— 忽略此列 —</option>
                          {UPLOADABLE_AFFILIATE_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={reset} className="btn-outline text-sm">重新选择</button>
            <button onClick={doUpload} disabled={uploading} className="btn-primary text-sm">
              {uploading ? "导入中…" : "开始导入"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && results && (
        <div className="space-y-3">
          <div className="card p-5">
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-xs text-slate-500">成功导入</p>
                  <p className="text-2xl font-bold text-emerald-600">{results.created}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-xs text-slate-500">合并到原记录</p>
                  <p className="text-2xl font-bold text-amber-600">{results.merged}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500">疑似重复（已新增）</p>
                  <p className="text-2xl font-bold text-amber-600">{results.warnings}</p>
                </div>
              </div>
            </div>
            {results.results.filter((r) => r.status !== "created").length > 0 && (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500">
                      <th className="py-1.5 pr-3 text-left font-medium">行</th>
                      <th className="py-1.5 pr-3 text-left font-medium">联盟商名称</th>
                      <th className="py-1.5 pr-3 text-left font-medium">状态</th>
                      <th className="py-1.5 text-left font-medium">相似记录</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.filter((r) => r.status !== "created").map((r, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-1 pr-3 text-slate-400">第{r.row}行</td>
                        <td className="py-1 pr-3">{r.name}</td>
                        <td className="py-1 pr-3">
                          {r.status === "merged" ? (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">已合并</span>
                          ) : (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">疑似重复</span>
                          )}
                        </td>
                        <td className="py-1 text-slate-400">
                          {r.duplicateOf ?? "—"}
                          {r.mergedFields?.length ? ` · 新增 ${r.mergedFields.length} 个字段` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="btn-outline text-sm">继续导入</button>
            <button onClick={onComplete} className="btn-primary text-sm">完成，查看列表</button>
          </div>
        </div>
      )}

      {/* ── Batch Management ── */}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">数据批次管理</h3>
          <button
            onClick={loadBatches}
            className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 刷新
          </button>
        </div>
        {batchesLoading ? (
          <p className="text-xs text-slate-400">加载中…</p>
        ) : batches.length === 0 ? (
          <p className="text-xs text-slate-400">暂无上传批次记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="py-1.5 pr-3 text-left font-medium">文件名</th>
                  <th className="py-1.5 pr-3 text-left font-medium">上传人</th>
                  <th className="py-1.5 pr-3 text-left font-medium">上传时间</th>
                  <th className="py-1.5 pr-3 text-left font-medium">记录数</th>
                  <th className="py-1.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-1.5 pr-3 text-slate-700 max-w-[200px] truncate">{b.fileName}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{b.uploader.name}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{formatDate(b.createdAt)}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{b.recordCount} 条</td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => deleteBatch(b.id)}
                        disabled={deletingBatch === b.id}
                        className="flex items-center gap-1 ml-auto rounded px-2 py-0.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deletingBatch === b.id ? "删除中…" : "删除批次"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">删除批次会同时删除该批次内所有联盟商数据，请谨慎操作</p>
      </div>

      {/* ── Bulk Assign Person in Charge ── */}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-semibold text-slate-800">批量更新负责人</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 items-end">
          <div>
            <label className="mb-1 block text-xs text-slate-500">当前负责人（可多选）</label>
            <MultiSelect
              options={picOptions}
              value={fromOwners}
              onChange={setFromOwners}
              placeholder="选择要替换的负责人"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">替换为（新负责人）</label>
            <SearchSelect
              options={users}
              value={toOwner}
              onChange={setToOwner}
              placeholder="— 请选择 —"
            />
          </div>
          <button
            onClick={doAssign}
            disabled={assigning || !toOwner || fromOwners.length === 0}
            className="btn-primary text-sm h-9 self-end"
          >
            {assigning ? "更新中…" : "一键替换"}
          </button>
        </div>
        {assignResult && (
          <p className={`mt-2 text-xs ${assignResult.includes("失败") ? "text-rose-600" : "text-emerald-600"}`}>
            {assignResult}
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          将所选「当前负责人」对应的所有联盟商，批量更新为「新负责人」
        </p>
      </div>

      {/* ── Data Cleanup ── */}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-rose-500" />
          <h3 className="text-sm font-semibold text-slate-800">数据清理</h3>
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">仅管理员</span>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["before_date", "no_contact", "by_status"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setCleanupMode(m); setCleanupPreviewCount(null); setCleanupResult(null); }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${cleanupMode === m ? "border-rose-400 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {m === "before_date" ? "按日期清理" : m === "no_contact" ? "无联系方式" : "按开发状态"}
              </button>
            ))}
          </div>

          {cleanupMode === "before_date" && (
            <div className="max-w-xs">
              <label className="mb-1 block text-xs text-slate-500">删除此日期之前创建的记录</label>
              <input
                type="date"
                className="input text-sm"
                value={cleanupDate}
                onChange={(e) => setCleanupDate(e.target.value)}
              />
            </div>
          )}

          {cleanupMode === "by_status" && (
            <div className="max-w-xs">
              <label className="mb-1 block text-xs text-slate-500">开发状态</label>
              <input
                type="text"
                className="input text-sm"
                value={cleanupStatus}
                onChange={(e) => setCleanupStatus(e.target.value)}
                placeholder="如：已拒绝"
              />
            </div>
          )}

          {cleanupMode === "no_contact" && (
            <p className="text-xs text-slate-500">将删除联系方式（联系方式字段和建联邮箱字段）均为空的联盟商</p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={doCleanupPreview}
              disabled={cleanupLoading || (cleanupMode === "before_date" && !cleanupDate) || (cleanupMode === "by_status" && !cleanupStatus)}
              className="btn-outline text-sm"
            >
              {cleanupLoading && cleanupPreviewCount === null ? "查询中…" : "预览数量"}
            </button>
            {cleanupPreviewCount !== null && (
              <>
                <span className="text-sm text-slate-600">共 <strong className="text-rose-600">{cleanupPreviewCount}</strong> 条将被删除</span>
                <button
                  onClick={doCleanup}
                  disabled={cleanupLoading || cleanupPreviewCount === 0}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {cleanupLoading ? "删除中…" : "确认删除"}
                </button>
              </>
            )}
          </div>

          {cleanupResult && (
            <p className={`text-xs ${cleanupResult.includes("失败") ? "text-rose-600" : "text-emerald-600"}`}>
              {cleanupResult}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
