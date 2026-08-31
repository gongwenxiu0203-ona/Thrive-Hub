"use client";

import { useEffect, useState } from "react";
import { SYSTEM_ERROR_CATALOG } from "@/lib/systemErrorCatalog";

type ErrorRow = {
  id: string; traceCode: string; category: string; context: string; module: string;
  statusCode: number; message: string; technicalDetails: string; status: string;
  resolutionNote: string | null; resolvedById: string | null; resolvedAt: string | null; createdAt: string;
};
type CatalogItem = { code: string; title: string; description: string; suggestion: string };
type Result = { items: ErrorRow[]; total: number; page: number; pageSize: number; modules: string[]; catalog: CatalogItem[] };
const statuses: Record<string, string> = { OPEN: "待处理", IN_PROGRESS: "处理中", RESOLVED: "已解决" };
const blankFilters = { code: "", module: "", status: "", from: "", to: "" };
const time = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });

export function SystemErrorsPanel({ canEdit }: { canEdit: boolean }) {
  const [draft, setDraft] = useState(blankFilters);
  const [filters, setFilters] = useState(blankFilters);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ErrorRow | null>(null);
  const [status, setStatus] = useState("OPEN");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const catalog = data?.catalog ?? SYSTEM_ERROR_CATALOG;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const query = new URLSearchParams({ ...filters, page: String(page) });
    fetch(`/api/admin/system-errors?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "查询失败，请重试。");
        if (!controller.signal.aborted) setData(result);
      })
      .catch(reason => { if (!controller.signal.aborted) { setData(null); setError(reason instanceof Error ? reason.message : "查询失败，请重试。"); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, reload]);

  async function save() {
    if (!selected || saving) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/admin/system-errors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, status, resolutionNote: note }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败，请重试。");
      setSelected(null); setNotice("处理记录已保存。"); setReload(value => value + 1);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "保存失败，请重试。"); }
    finally { setSaving(false); }
  }

  return <section className="space-y-5 text-sm text-slate-700" aria-label="系统错误查询">
    <header>
      <h2 className="text-lg font-semibold text-slate-900">系统错误查询</h2>
      <p className="mt-1 max-w-3xl">粘贴弹窗中的 ERR 错误码定位本次异常。仅显示功能启用后接入统一错误处理的记录，历史错误不会自动补录。</p>
    </header>
    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4" onSubmit={event => { event.preventDefault(); setFilters({ ...draft }); setPage(1); setSelected(null); setReload(value => value + 1); }}>
      <label className="min-w-0 flex-[2_1_250px]">错误码<input className="input mt-1 w-full" placeholder="输入完整或部分错误码" maxLength={100} value={draft.code} onChange={event => setDraft({ ...draft, code: event.target.value })} /></label>
      <label className="min-w-0 flex-[1_1_140px]">模块<select className="input mt-1 w-full" value={draft.module} onChange={event => setDraft({ ...draft, module: event.target.value })}><option value="">全部模块</option>{data?.modules.map(module => <option key={module} value={module}>{module}</option>)}</select></label>
      <label className="min-w-0 flex-[1_1_130px]">处理状态<select className="input mt-1 w-full" value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="">全部状态</option>{Object.entries(statuses).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
      <label className="min-w-0 flex-[1_1_150px]">开始日期<input type="date" className="input mt-1 w-full" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
      <label className="min-w-0 flex-[1_1_150px]">结束日期<input type="date" className="input mt-1 w-full" min={draft.from} value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
      <div className="flex gap-2"><button className="btn-primary min-h-10" disabled={loading}>查询</button><button type="button" className="btn-secondary min-h-11 min-h-10" disabled={loading} onClick={() => { setDraft(blankFilters); setFilters(blankFilters); setPage(1); setSelected(null); setReload(value => value + 1); }}>重置</button></div>
    </form>
    {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-md bg-slate-100 p-3">{notice}</p>}
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-busy={loading}>
      {loading ? <p role="status" className="p-8">正在加载错误记录…</p> : !data?.items.length ? <div className="p-8 text-center"><p className="font-medium">未找到匹配的错误记录</p><p className="mt-2">可清空筛选后重试。旧错误码需结合服务器日志排查；日志服务异常时也可能未能入库。</p></div> : <div className="overflow-x-auto"><table className="data w-full min-w-[820px] text-sm"><thead><tr><th>发生时间</th><th>错误码 / 类型</th><th>模块 / 操作</th><th>错误说明</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}>
        <td className="whitespace-nowrap">{time(row.createdAt)}</td><td><span className="font-mono text-xs">{row.traceCode}</span><div className="mt-1">{catalog.find(item => item.code === row.category)?.title ?? row.category}</div></td><td><span>{row.module}</span><div className="max-w-48 break-all text-xs">{row.context}</div></td><td className="max-w-xs break-words">{row.message}</td><td className="whitespace-nowrap">{statuses[row.status] ?? row.status}</td><td><button className="btn-secondary min-h-11 whitespace-nowrap" type="button" onClick={() => { setSelected(row); setStatus(row.status); setNote(row.resolutionNote ?? ""); setNotice(""); }}>查看详情</button></td>
      </tr>)}</tbody></table></div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-3"><span>共 {data?.total ?? 0} 条 · 第 {page} 页</span><div className="flex gap-2"><button type="button" className="btn-secondary min-h-11" disabled={loading || page <= 1} onClick={() => { setPage(value => value - 1); setSelected(null); }}>上一页</button><button type="button" className="btn-secondary min-h-11" disabled={loading || !data || page * data.pageSize >= data.total} onClick={() => { setPage(value => value + 1); setSelected(null); }}>下一页</button></div></footer>
    </div>
    {selected && <section aria-label="错误详情" className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">错误详情 · <span className="break-all font-mono text-xs">{selected.traceCode}</span></h3><button type="button" className="btn-secondary min-h-11" disabled={saving} onClick={() => setSelected(null)}>收起详情</button></div>
      <p>{selected.message} · HTTP {selected.statusCode}</p>
      <p>排查建议：{catalog.find(item => item.code === selected.category)?.suggestion ?? "请结合发生时间、操作模块与服务器日志进一步排查。"}</p>
      <details><summary className="cursor-pointer font-medium">脱敏技术信息</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-3 text-xs">{selected.technicalDetails || "暂无技术信息"}</pre></details>
      {selected.resolvedAt && <p>解决时间：{time(selected.resolvedAt)}</p>}
      <div className="flex flex-wrap gap-4"><label className="w-full sm:w-44">处理状态<select className="input mt-1 w-full" disabled={!canEdit || saving} value={status} onChange={event => setStatus(event.target.value)}>{Object.entries(statuses).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label><label className="min-w-0 flex-[1_1_300px]">处理备注{status === "RESOLVED" ? "（必填）" : "（选填）"}<textarea className="input mt-1 min-h-24 w-full" maxLength={2000} disabled={!canEdit || saving} placeholder="记录原因及处理结果，不要填写密码、密钥或账户信息。" value={note} onChange={event => setNote(event.target.value)} /></label></div>
      {canEdit && <button type="button" className="btn-primary" disabled={saving || (status === "RESOLVED" && !note.trim())} onClick={save}>{saving ? "保存中…" : "保存处理记录"}</button>}
    </section>}
    <details className="rounded-lg border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-slate-900">常见错误说明</summary><p className="mt-3">ERR 是一次异常的追踪编号，不代表固定原因。以下类型用于辅助排查，具体原因以对应记录为准。</p><dl className="mt-4 space-y-4">{catalog.map(item => <div key={item.code}><dt className="font-medium">{item.title} <span className="font-mono text-xs">{item.code}</span></dt><dd className="mt-1">{item.description}</dd><dd className="mt-1">建议：{item.suggestion}</dd></div>)}</dl></details>
  </section>;
}
