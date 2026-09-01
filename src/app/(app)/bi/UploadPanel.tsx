"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  Trash2,
  FileSpreadsheet,
  ArrowLeft,
  AlertCircle,
  Download,
  Loader2,
  X,
} from "lucide-react";
import { deleteBatch } from "@/actions/sales";
import { getMappableFields, FIELD_HINTS } from "@/lib/salesImport";
import { PLATFORM_NAMES } from "@/lib/platformMappings";
import { formatDateTime, formatNumber } from "@/lib/utils";

type Batch = {
  id: string;
  fileName: string;
  recordCount: number;
  platform: string | null;
  customerName: string | null;
  uploaderName: string;
  createdAt: string;
};

type ParseResult = {
  tempId: string;
  fileName: string;
  columns: string[];
  // Only the first few rows are returned for mapping preview (full data is
  // held server-side as a temp file referenced by tempId).
  sampleRows: Record<string, unknown>[];
  rowCount: number;
  suggestedMapping: Record<string, string>;
};

type CustomerOption = { id: string; brandName: string };

const MAPPABLE = getMappableFields();
type UploadPhase = "idle" | "uploading" | "parsing" | "importing";

const LARGE_FILE_NOTICE_BYTES = 50 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function UploadPanel({
  batches,
  customers,
}: {
  batches: Batch[];
  customers: CustomerOption[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [transitionPending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [platform, setPlatform] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [activeFile, setActiveFile] = useState<{ name: string; size: number } | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const router = useRouter();
  const busy = phase !== "idle" || transitionPending;

  function cancelActiveRequest() {
    const cancelledPhase = phase;
    xhrRef.current?.abort();
    requestAbortRef.current?.abort();
    xhrRef.current = null;
    requestAbortRef.current = null;
    setPhase("idle");
    setUploadPercent(0);
    setError(
      cancelledPhase === "importing"
        ? "已停止等待导入结果。若服务器已开始写入，任务可能仍会完成，请稍后刷新批次列表确认。"
        : "操作已取消。文件未导入，可重新选择后继续。",
    );
    if (inputRef.current) inputRef.current.value = "";
  }

  function resetFlow() {
    xhrRef.current?.abort();
    requestAbortRef.current?.abort();
    setParsed(null);
    setMapping({});
    setError(null);
    setDone(null);
    setPhase("idle");
    setUploadPercent(0);
    setActiveFile(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(null);
    setActiveFile({ name: file.name, size: file.size });
    setUploadPercent(0);
    setPhase("uploading");

    try {
      const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("POST", "/api/sales/parse");
        xhr.responseType = "text";
        xhr.timeout = REQUEST_TIMEOUT_MS;
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
        xhr.setRequestHeader("x-platform", encodeURIComponent(platform));
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setUploadPercent(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        };
        xhr.upload.onload = () => {
          setUploadPercent(100);
          setPhase("parsing");
        };
        xhr.onload = () => {
          let response: Record<string, unknown> = {};
          try {
            response = JSON.parse(xhr.responseText) as Record<string, unknown>;
          } catch {
            if (xhr.responseText.trim()) response = { error: xhr.responseText.trim() };
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(response);
          else reject(new Error((response.error as string) || `文件解析请求失败（HTTP ${xhr.status}）`));
        };
        xhr.onerror = () => reject(new Error("网络请求失败，请检查网络连接后重试"));
        xhr.ontimeout = () => reject(new Error("上传或解析超过 10 分钟，请检查网络后重试；若仍失败可拆分文件。"));
        xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
        xhr.send(file);
      });
      setParsed(data as unknown as ParseResult);
      setMapping((data.suggestedMapping as Record<string, string>) ?? {});
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "上传失败，请稍后重试");
      }
    } finally {
      xhrRef.current = null;
      setPhase("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function confirmImport() {
    if (!parsed) return;
    if (!customerId) {
      setError("请先选择关联客户后再导入数据。");
      return;
    }
    // Fields with auto-fallback don't require a manual mapping
    const missing = MAPPABLE.filter(
      (f) => f.required && !mapping[f.key] && !FIELD_HINTS[f.key],
    );
    if (missing.length > 0) {
      setError(
        `以下必填字段尚未映射：${missing
          .map((f) => `「${f.label}」`)
          .join("、")}`,
      );
      return;
    }
    setError(null);
    setPhase("importing");
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    void (async () => {
      let res: Response;
      try {
        res = await fetch("/api/sales/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Send the server-side tempId instead of all rows — avoids a huge
          // request body that would hit proxy / server size limits.
          body: JSON.stringify({
            tempId: parsed.tempId,
            mapping,
            platform,
            customerId: customerId || null,
            fileName: parsed.fileName,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("网络请求失败，请检查网络连接后重试");
        }
        return;
      }
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        setError(`服务器返回了非预期响应（HTTP ${res.status}），请检查控制台日志或联系管理员。`);
        return;
      }
      if (!res.ok) {
        setError((data.error as string) ?? "导入失败");
        return;
      }
      const skippedNote =
        (data.skipped as unknown[])?.length > 0
          ? `，跳过 ${(data.skipped as unknown[]).length} 行（缺失必填值）`
          : "";
      const affNote =
        (data.newAffiliateCount as number) > 0
          ? `；已将 ${data.newAffiliateCount} 个新联盟商自动添加至资源库（状态：待开发）`
          : "";
      setDone(`成功导入 ${data.imported} 条销售记录${skippedNote}${affNote}`);
      setParsed(null);
      setMapping({});
      router.refresh();
    })().finally(() => {
      clearTimeout(timer);
      requestAbortRef.current = null;
      setPhase("idle");
    });
  }

  function onDelete(id: string) {
    if (!confirm("确认删除该批次？该批次下的所有销售记录将一并删除。")) return;
    startTransition(async () => {
      try {
        await deleteBatch(id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Upload rules notice */}
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="mb-2 text-sm font-semibold text-amber-800">📋 数据上传规则</p>
        <ol className="list-decimal list-inside space-y-1 text-xs text-amber-700">
          <li>源数据从平台下载后上传时，缺少的必填字段需在映射步骤中手动补足（如品牌、佣金比例等）。</li>
          <li>上传前请删除无效数据行（如销售金额为 0、佣金为 0 的行），避免影响统计准确性。</li>
        </ol>
        <div className="mt-3 flex items-center gap-2">
          <a
            href="/api/sales/template"
            className="inline-flex items-center gap-1 text-xs text-amber-800 underline hover:text-amber-900"
          >
            <Download className="h-3.5 w-3.5" /> 下载通用上传模板
          </a>
          <span className="text-xs text-amber-500">（不区分平台，包含所有必填列）</span>
        </div>
      </section>

      <section className="card p-6">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={onFile}
        />

        {/* Pre-upload setup: customer + platform */}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">
              关联客户 <span className="text-rose-500">*</span>
            </label>
            <select
              className={`input ${!customerId ? "border-rose-300" : ""}`}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={!!parsed}
            >
              <option value="">请选择关联客户</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brandName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">
              联盟平台 <span className="text-slate-400 text-xs font-normal">（映射表中可覆盖）</span>
            </label>
            <select
              className="input"
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                setParsed(null);
                setMapping({});
              }}
              disabled={!!parsed}
            >
              <option value="">请选择联盟平台</option>
              {PLATFORM_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            {platform ? (
              <a
                href={`/api/sales/template?platform=${encodeURIComponent(platform)}`}
                className="btn-secondary flex-1 justify-center"
              >
                <Download className="h-4 w-4" />
                {platform} 模板
              </a>
            ) : (
              <a
                href="/api/sales/template"
                className="btn-secondary flex-1 justify-center"
              >
                <Download className="h-4 w-4" /> 通用模板
              </a>
            )}
          </div>
        </div>

        {/* step indicator */}
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              parsed
                ? "bg-emerald-100 text-emerald-700"
                : "bg-brand-600 text-white"
            }`}
          >
            1
          </span>
          <span className={parsed ? "text-slate-400" : "text-slate-800"}>
            上传文件
          </span>
          <span className="text-slate-300">—</span>
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              parsed ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"
            }`}
          >
            2
          </span>
          <span className={parsed ? "text-slate-800" : "text-slate-400"}>
            确认字段映射
          </span>
        </div>

        {!parsed ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center">
            <UploadCloud className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">
              上传联盟推广销售数据（Excel / CSV）
            </p>
            <p className="mt-1 text-xs text-slate-400">
              首行需为表头。{platform ? `系统将按 ${platform} 平台规则自动建议字段映射，` : "未选择平台时字段映射需手动配置，"}可手动调整每个字段。
            </p>
            <button
              className="btn-primary mt-4"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud className="h-4 w-4" />
              {busy ? "处理中…" : "选择文件"}
            </button>
            {activeFile && phase !== "idle" && (
              <div className="mt-5 w-full max-w-lg rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-left">
                <div className="flex items-start gap-3">
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-slate-700">{activeFile.name}</span>
                      <span className="shrink-0 text-slate-500">{formatFileSize(activeFile.size)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {phase === "uploading" && `正在上传 ${uploadPercent}%（请勿关闭页面）`}
                      {phase === "parsing" && "上传完成，正在读取表头并生成字段映射…"}
                      {phase === "importing" && "正在校验并写入数据库，大文件可能需要几分钟…"}
                    </p>
                    {phase === "uploading" && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-200" style={{ width: `${uploadPercent}%` }} />
                      </div>
                    )}
                    {activeFile.size >= LARGE_FILE_NOTICE_BYTES && (
                      <p className="mt-2 text-[11px] text-amber-700">大文件已启用长时上传模式；网络较慢时会继续等待，不会在 90 秒自动中断。</p>
                    )}
                  </div>
                  <button type="button" onClick={cancelActiveRequest} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="取消当前操作" title="取消">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-slate-500">
              已读取 <b>{parsed.rowCount}</b> 行、{parsed.columns.length}{" "}
              个列。{platform ? <>系统已按 <b>{platform}</b> 平台规则自动匹配映射，</> : "未选择平台，请手动配置映射，"}请核对并调整必填字段（
              <span className="text-rose-500">*</span>）。
            </p>
            <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-slate-200">
              <table className="data w-full">
                <thead>
                  <tr>
                    <th>系统字段</th>
                    <th>对应表格列</th>
                    <th>数据预览</th>
                  </tr>
                </thead>
                <tbody>
                  {MAPPABLE.map((field) => {
                    const col = mapping[field.key] ?? "";
                    const preview = col
                      ? String(parsed.sampleRows[0]?.[col] ?? "")
                      : "";
                    const hint = FIELD_HINTS[field.key];
                    return (
                      <tr key={field.key}>
                        <td className="font-medium text-slate-700">
                          {field.label}
                          {field.required && (
                            <span className="ml-1 text-rose-500">*</span>
                          )}
                          {hint && (
                            <p className="mt-0.5 text-[10px] font-normal text-slate-400">
                              {hint}
                            </p>
                          )}
                        </td>
                        <td>
                          <select
                            className={`input ${
                              field.required && !col && !hint ? "border-rose-400" : ""
                            }`}
                            value={col}
                            onChange={(e) =>
                              setMapping((m) => ({
                                ...m,
                                [field.key]: e.target.value,
                              }))
                            }
                          >
                            <option value="">— {hint ? "自动处理" : "不导入"} —</option>
                            {parsed.columns.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="max-w-[12rem] truncate text-xs text-slate-400">
                          {preview || (hint ? <span className="italic">{hint}</span> : "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <button className="btn-secondary" onClick={resetFlow}>
                <ArrowLeft className="h-4 w-4" /> 重新上传
              </button>
              <div className="flex items-center gap-2">
                {phase === "importing" && (
                  <button className="btn-secondary" type="button" onClick={cancelActiveRequest}>
                    <X className="h-4 w-4" /> 取消导入
                  </button>
                )}
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={confirmImport}
                >
                  {phase === "importing" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> 正在解析并写入…</>
                  ) : `确认导入 ${parsed.rowCount} 条`}
                </button>
              </div>
            </div>
            {phase === "importing" && (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                大文件正在服务器端校验、查重并分批写入。请保持此页面打开，完成后会自动刷新批次列表。
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">导入未完成</p>
              <p className="mt-0.5 text-xs">{error}</p>
              <p className="mt-1 text-xs text-rose-500/80">
                指引：请确认 ①文件首行为列名 ②必填字段（订单日期/联盟商名称/销售金额）已正确映射 ③日期与金额列格式正确。
              </p>
            </div>
          </div>
        )}
        {done && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
            {done}
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-slate-900">
          数据批次管理（{batches.length}）
        </h2>
        {batches.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            暂无上传批次
          </p>
        ) : (
          <ul className="space-y-2">
            {batches.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3"
              >
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">
                    {b.fileName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatNumber(b.recordCount)} 条 · {b.platform ?? "—"} ·{" "}
                    {b.customerName ?? "未关联客户"} · {b.uploaderName} ·{" "}
                    {formatDateTime(b.createdAt)}
                  </p>
                </div>
                <button
                  className="btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => onDelete(b.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除批次
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
