"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { confirmationDraftSchema, type ContractConfirmationDraft as Draft } from "@/lib/contractConfirmationDraft";

type Row = { id: string; number: string; title: string; status: string; version: number; signedFileUrl: string | null; pendingSignedFileUrl: string | null; pendingVersion: number; draft: Draft; pendingDraft: Draft | null; versions: { version?: number; versionNo?: number; createdAt?: string }[] };
type Data = {
  contract: { id: string; contractNo: string; type: string; status: string; contractMode: string; partyA: string | null; partyAContact: string | null; partyAEmail: string | null; partyAPhone: string | null; partyBContact: string | null; partyBEmail: string | null; partyBPhone: string | null; customer: { id: string; brandName: string } | null };
  users: { id: string; name: string; email: string; phone: string | null }[];
  canRenumber: boolean;
  canEdit: boolean; canManage: boolean;
  bankAccounts: { id: string; name: string; accountName: string; accountNumber: string; bankName: string }[];
  confirmationTemplates: { id: string; name: string }[];
  options: { category: string; value: string }[]; confirmations: Row[];
};
const control = "w-full min-w-0 rounded-md border border-purple-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-slate-100";
const states: Record<string, string> = { DRAFT: "草稿", EFFECTIVE: "已签署生效", ACTIVE: "已签署生效", TERMINATED: "已终止", VOID: "已作废" };
const currencies = ["USD", "CNY", "EUR", "GBP", "HKD", "JPY", "CAD", "AUD", "SGD", "CHF", "NZD", "KRW"];
const defaults: Record<string, string[]> = {
  COUNTRY: ["美国", "英国", "德国", "法国", "意大利", "西班牙", "加拿大", "澳大利亚", "日本", "中国", "中国香港"],
  SALES_PLATFORM: ["Amazon", "Walmart", "Shopify"], PROGRAM: ["Attribution", "Creator Connections (ACC)"],
  THIRD_PARTY_PLATFORM: ["无", "Levanta", "PartnerBoost"], SALES_SOURCE: ["Amazon Attribution", "Amazon Creator Connections (ACC)", "Amazon 销售平台后台", "Shopify 后台", "Google Analytics 4 (GA4)"],
};
function initial(contractId: string): Draft {
  return { contractId, title: "", workflowMode: "FORM", templateId: null, brand: "", storeUrl: "", startDate: null, endDate: null, minimumMonths: 6,
    partyAContact: { name: "", email: "", phone: "" }, partyBContact: { name: "", email: "", phone: "" }, receivingAccountIds: [], scopes: [], productScope: "ALL", products: [], serviceDescription: "", monthlyFee: null, commission: null, additionalFees: [], attributionWindowDays: 30, orderLockDays: 30, tailDays: 30, tailTerms: "", salesSources: [], taxBasis: "EXCLUSIVE", paymentTerms: "", note: "" };
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1.5 text-sm text-slate-700"><span>{label}</span>{children}</label>;
}
function Currency({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const all = [...new Set([...currencies, value])];
  return <select className={control} value={value} onChange={e => onChange(e.target.value)}>{all.map(c => <option key={c}>{c}</option>)}</select>;
}
/** In-flow disclosure avoids clipping inside the responsive form and supports keyboard input. */
function Choices({ label, values, options, onChange, multiple = true }: { label: string; values: string[]; options: string[]; onChange: (values: string[]) => void; multiple?: boolean }) {
  const [query, setQuery] = useState("");
  const available = [...new Set([...options, ...values])].filter(x => x.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function toggle(v: string) { onChange(multiple ? values.includes(v) ? values.filter(x => x !== v) : [...values, v] : [v]); }
  function add() { const value = query.trim(); if (!value) return; const existing = [...options, ...values].find(x => x.toLocaleLowerCase() === value.toLocaleLowerCase()); if (!values.includes(existing || value)) onChange(multiple ? [...values, existing || value] : [existing || value]); setQuery(""); }
  return <div className="min-w-0 space-y-1.5 text-sm"><span className="text-slate-700">{label}</span><details className="rounded-md border border-purple-200 bg-white"><summary className="cursor-pointer break-words px-3 py-2 text-slate-900">{values.join("、") || "请选择 / 搜索"}</summary><div className="space-y-2 border-t border-purple-100 p-2"><input aria-label={`搜索${label}或手动新增`} className={control} placeholder="搜索，找不到可手动新增" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} /><div className="max-h-40 space-y-1 overflow-y-auto">{available.map(option => <label key={option} className="flex items-start gap-2 rounded p-1 text-slate-800"><input type={multiple ? "checkbox" : "radio"} checked={values.includes(option)} onChange={() => toggle(option)} className="mt-1 accent-purple-600" /><span className="break-words">{option}</span></label>)}</div><Button size="sm" disabled={!query.trim()} onClick={add}>其他：新增“{query.trim() || "选项"}”</Button></div></details></div>;
}

export function ConfirmationEditor({ contractId }: { contractId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [newNumber, setNewNumber] = useState("");
  const [numberReason, setNumberReason] = useState("");
  const [exportSelection, setExportSelection] = useState("both");
  const [chooser, setChooser] = useState(false);
  const [operation, setOperation] = useState<"ADD" | "REPLACE">("ADD");
  const [method, setMethod] = useState<"FORM" | "SIGNED_UPLOAD">("FORM");
  const [targetId, setTargetId] = useState("");
  const [replacement, setReplacement] = useState(false);
  const base = `/api/contracts/${encodeURIComponent(contractId)}/confirmations`;
  const load = useCallback(async () => { const res = await fetch(base, { cache: "no-store" }); const body = await res.json(); if (!res.ok) throw new Error(body.error || body.message || "确认书读取失败"); setData(body); return body as Data; }, [base]);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(d => d ? { ...d, [key]: value } : d); }
  const opts = (key: string) => [...new Set([...(defaults[key] || []), ...(data?.options.filter(o => o.category === key).map(o => o.value) || [])])];
  const editable = !!data?.canEdit && (!editing || editing.status === "DRAFT" || replacement);
  const unsaved = !!editing && !!draft && JSON.stringify(replacement ? editing.pendingDraft : editing.draft) !== JSON.stringify(draft);
  function open(row: Row | null, asReplacement = false, workflow: "FORM" | "SIGNED_UPLOAD" = "FORM") {
    if (draft && !window.confirm("离开当前编辑内容？未保存的修改会丢失。")) return;
    const next = row ? structuredClone(asReplacement && row.pendingDraft ? row.pendingDraft : row.draft) : initial(contractId);
    next.workflowMode = workflow;
    if (workflow === "FORM" && !next.templateId) next.templateId = data?.confirmationTemplates[0]?.id || null;
    if (workflow === "SIGNED_UPLOAD") next.templateId = null;
    if (!row && data) {
      next.partyAContact = { name: data.contract.partyAContact || "", email: data.contract.partyAEmail || "", phone: data.contract.partyAPhone || "" };
      next.partyBContact = { name: data.contract.partyBContact || "", email: data.contract.partyBEmail || "", phone: data.contract.partyBPhone || "" };
      next.brand = data.contract.customer?.brandName || "";
      next.receivingAccountIds = data.bankAccounts.map(account => account.id);
    }
    setReplacement(asReplacement); setEditing(row); setDraft(next); setReason(""); setFile(null); setError(""); setNotice(""); setNewNumber(row?.number || ""); setNumberReason("");
  }
  function beginCreate() {
    if (!data) return;
    if (!data.confirmations.length) { open(null, false, "FORM"); return; }
    setOperation("ADD"); setMethod("FORM"); setTargetId(data.confirmations.find(row => row.status === "EFFECTIVE")?.id || data.confirmations[0]?.id || ""); setChooser(true);
  }
  function confirmCreateChoice() {
    if (!data) return;
    if (operation === "REPLACE") {
      const row = data.confirmations.find(item => item.id === targetId);
      if (!row || row.status !== "EFFECTIVE") { setError("请选择一份已签署生效的确认书进行替换"); return; }
      open(row, true, method);
    } else open(null, false, method);
    setChooser(false);
  }
  async function request(url: string, init: RequestInit) { const res = await fetch(url, init); const body = await res.json(); if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : body.message || "操作失败，请重试"); return body; }
  async function save() {
    if (!draft) return;
    const check = confirmationDraftSchema.safeParse(draft);
    if (!check.success) { setError(check.error.issues.map(i => `${i.path.join(".")}：${i.message}`).join("；")); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const previouslySigned = Boolean(editing?.signedFileUrl);
      const url = editing ? `${base}/${editing.id}${replacement ? "?action=replace" : ""}` : base;
      const payload = editing ? replacement ? { draft, pendingVersion: editing.pendingVersion, reason } : { draft, expectedVersion: editing.version, reason } : { draft };
      const body = await request(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const fresh = await load(); const saved = fresh.confirmations.find(r => r.id === body.confirmation.id);
      if (saved) { setEditing(saved); setDraft(structuredClone(replacement && saved.pendingDraft ? saved.pendingDraft : saved.draft)); }
      setReason("");
      setNotice(body.activated
        ? "字段已补齐，已复用上传的签署原件；主合同和项目确认书均已签署完成，并已生成独立对账。"
        : replacement
          ? "替换草稿已保存。当前已生效版本继续有效；上传新版本签署原件后才会完成版本切换。"
        : previouslySigned && !saved?.signedFileUrl
          ? "草稿已保存。由于确认书内容发生修改，原盖章版仅保留在历史版本中；请重新上传与当前内容一致的签署原件。"
          : "草稿已保存。上传签署原件后，可按生效条件继续处理。");
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); }
  }
  async function renumber() {
    if (!editing || unsaved) { setError("请先保存或取消当前表单修改，再修改编号"); return; }
    setBusy(true); setError("");
    try {
      await request(`${base}/${editing.id}?action=renumber`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: newNumber, reason: numberReason, expectedVersion: editing.version }) });
      const fresh = await load(); const saved = fresh.confirmations.find(row => row.id === editing.id);
      if (saved) { setEditing(saved); setDraft(structuredClone(saved.draft)); setNewNumber(saved.number); }
      setNumberReason(""); setNotice("编号已修改，原因已记录；历史对账与发票快照保持不变。");
    } catch (e) { setError(e instanceof Error ? e.message : "修改编号失败"); } finally { setBusy(false); }
  }
  async function exportDocument() {
    if (unsaved || (!editing && exportSelection !== "master")) { setError("请先保存并选择需要导出的确认书"); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/contracts/${contractId}/framework-export?selection=${exportSelection}${editing ? `&confirmationId=${editing.id}` : ""}`);
      if (!res.ok) { const body = await res.json(); throw new Error(body.error || "导出失败"); }
      const url = URL.createObjectURL(await res.blob()); const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `${data?.contract.contractNo}-${exportSelection}.docx`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("已导出填充后的Word合同，请核对内容后签署。");
    } catch (e) { setError(e instanceof Error ? e.message : "导出失败"); } finally { setBusy(false); }
  }
  async function upload() {
    if (!editing || !file) return;
    if (unsaved) { setError("请先保存表单修改，再上传签署原件。"); return; }
    if (!reason.trim()) { setError("请填写本次上传原件的原因。"); return; }
    if (file.size > 20 * 1024 * 1024) { setError("签署原件不能超过20MB。"); return; }
    setBusy(true); setError(""); setNotice("");
    try { const form = new FormData(); form.set("file", file); form.set("expectedVersion", String(replacement ? editing.pendingVersion : editing.version)); form.set("reason", reason); const result = await request(`${base}/${editing.id}${replacement ? "?action=replace" : ""}`, { method: "PUT", body: form }); const fresh = await load(); const saved = fresh.confirmations.find(r => r.id === editing.id); if (saved) { setEditing(saved); setDraft(structuredClone(saved.draft)); } setReplacement(false); setFile(null); setNotice(result.replacement ? "替换版本已签署生效：编号保持不变、版本已递增，历史账务已保留，未来计划已按新版本生成。" : result.activated ? "签署原件已存档，项目确认书已签署生效并生成独立对账。" : "签署原件已存档；表单字段保持不变，请核对后手动确认生效。"); } catch (e) { setError(e instanceof Error ? e.message : "上传失败"); } finally { setBusy(false); }
  }
  async function activate() {
    if (unsaved) { setError("请先保存表单修改，再确认生效。"); return; }
    if (!editing || !window.confirm("确认生效此确认书？生效后锁定本版本的计费规则，并按该确认书独立生成对账。")) return;
    setBusy(true); setError(""); setNotice("");
    try { await request(`${base}/${editing.id}?action=activate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: editing.version }) }); const fresh = await load(); const saved = fresh.confirmations.find(r => r.id === editing.id); if (saved) { setEditing(saved); setDraft(structuredClone(saved.draft)); } setNotice("项目确认书已生效。"); } catch (e) { setError(e instanceof Error ? e.message : "生效失败"); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-7xl space-y-6 pb-10">
    <Link href={`/contracts/${contractId}`} className="text-sm text-purple-700">← 返回主合同</Link>
    {data?.canEdit && data.contract.contractMode === "FRAMEWORK" && <Link href={`/contracts/new?contractId=${contractId}`} className="ml-4 text-sm text-purple-700">编辑主合同资料</Link>}
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-slate-900">项目确认书</h1><p className="mt-2 text-sm text-slate-600">{data?.contract.contractNo} · {data?.contract.customer?.brandName} · 同一主合同下，每份生效确认书独立计费、独立对账。</p></div>{data?.canEdit && <Button variant="primary" disabled={busy} onClick={beginCreate}>新建项目确认书</Button>}</header>
    {chooser && data && <section className="space-y-5 rounded-xl border border-purple-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">选择项目确认书处理方式</h2><p className="mt-1 text-sm text-slate-600">替换保留原编号并递增版本；新增会生成下一个确认书编号。</p></div><button className="text-sm text-slate-600" onClick={() => setChooser(false)}>关闭</button></div><div className="grid gap-3 sm:grid-cols-2"><button className={`rounded-lg border p-4 text-left ${operation === "ADD" ? "border-purple-500 bg-purple-50" : "border-slate-200"}`} onClick={() => setOperation("ADD")}><strong>新增项目确认书</strong><span className="mt-1 block text-sm text-slate-600">独立编号、从 v1 开始，独立计费和对账。</span></button><button className={`rounded-lg border p-4 text-left ${operation === "REPLACE" ? "border-purple-500 bg-purple-50" : "border-slate-200"}`} onClick={() => setOperation("REPLACE")}><strong>替换当前项目确认书</strong><span className="mt-1 block text-sm text-slate-600">编号不变；签署前旧版本继续有效，签署后版本递增。</span></button></div>{operation === "REPLACE" && <Field label="需要替换的已生效项目确认书"><select className={control} value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">请选择</option>{data.confirmations.filter(row => row.status === "EFFECTIVE").map(row => <option key={row.id} value={row.id}>{row.number} · v{row.version}</option>)}</select></Field>}<div className="grid gap-3 sm:grid-cols-2"><button className={`rounded-lg border p-4 text-left ${method === "FORM" ? "border-purple-500 bg-purple-50" : "border-slate-200"}`} onClick={() => setMethod("FORM")}><strong>在线新建项目确认书</strong><span className="mt-1 block text-sm text-slate-600">选择模板、填写字段并导出；签署后上传原件。</span></button><button className={`rounded-lg border p-4 text-left ${method === "SIGNED_UPLOAD" ? "border-purple-500 bg-purple-50" : "border-slate-200"}`} onClick={() => setMethod("SIGNED_UPLOAD")}><strong>上传已签署确认书</strong><span className="mt-1 block text-sm text-slate-600">先补齐字段再上传签署原件，上传后直接生效。</span></button></div><div className="flex justify-end"><Button variant="primary" disabled={operation === "REPLACE" && !targetId} onClick={confirmCreateChoice}>继续填写</Button></div></section>}
    {data?.contract.contractMode === "FRAMEWORK" && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-purple-100 bg-white p-4"><label className="flex min-w-0 items-center gap-2 text-sm">导出范围<select className={control} value={exportSelection} onChange={e => setExportSelection(e.target.value)}><option value="both">主格式合同＋当前项目确认书</option><option value="master">仅主格式合同</option><option value="confirmation">仅当前项目确认书</option></select></label><Button disabled={busy || !["SIGNING", "COMPLETED"].includes(data.contract.status) || (exportSelection !== "master" && !editing)} onClick={exportDocument}>导出已填合同（Word）</Button><span className="text-xs text-slate-500">{["SIGNING", "COMPLETED"].includes(data.contract.status) ? "签署区域保留供双方签署。" : "请返回合同详情页，先提交审核（默认）或选择跳过审核，再导出。"}</span></div>}
    {error && <div role="alert" className="break-words rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-800">{notice}</div>}
    {!data && !error && <div className="h-32 rounded-lg bg-slate-100" aria-label="正在加载确认书" />}
    {data && <>
      {data.contract.contractMode !== "FRAMEWORK" && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">这是历史合同：可录入确认书草稿，但暂不能生效。不会转换旧合同，也不会覆盖或重复生成历史收费。</p>}
      <section className="overflow-x-auto rounded-lg border border-purple-100 bg-white"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{["确认书编号", "状态", "版本", "合作周期", "操作"].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{data.confirmations.map(row => <tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-3"><div className="font-medium text-slate-900">{row.number}</div></td><td className="px-4 py-3">{states[row.status] || row.status}{row.pendingDraft && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">替换草稿</span>}</td><td className="px-4 py-3">v{row.version}{row.pendingDraft && <span className="text-slate-500"> → v{row.version + 1}</span>}</td><td className="px-4 py-3">{row.draft.startDate || "未填写"} — {row.draft.endDate || "未填写"}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-3"><button className="text-purple-700" disabled={busy} onClick={() => open(row)}>{data.canEdit && row.status === "DRAFT" ? "编辑草稿" : "查看"}</button>{row.pendingDraft && <button className="text-amber-700" disabled={busy} onClick={() => open(row, true, row.pendingDraft!.workflowMode)}>继续替换草稿</button>}{row.signedFileUrl && <a className="text-purple-700" href={`${base}/${row.id}?download=1`}>下载原件</a>}</div></td></tr>)}</tbody></table>{!data.confirmations.length && <p className="p-8 text-center text-sm text-slate-600">暂无确认书。点击“新建项目确认书”录入合作范围和收费规则。</p>}</section>
    </>}
    {draft && data && <section className="rounded-xl border border-purple-100 bg-white p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{replacement && editing ? `替换 ${editing.number} · 目标版本 v${editing.version + 1}` : editing ? `${editing.number} · ${states[editing.status] || editing.status}` : "新增项目确认书"}</h2><Button onClick={() => { if (window.confirm("关闭当前编辑区？未保存修改会丢失。")) { setDraft(null); setEditing(null); setReplacement(false); } }}>关闭编辑区</Button></div>
      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-medium text-slate-800">创建方式：{draft.workflowMode === "FORM" ? "在线新建并导出签署" : "上传已签署确认书"}</p>{draft.workflowMode === "FORM" && <div className="mt-3"><Field label="项目确认书模板 *"><select className={control} value={draft.templateId || ""} onChange={e => update("templateId", e.target.value || null)}><option value="">请选择项目确认书模板</option>{data.confirmationTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>{!data.confirmationTemplates.length && <p className="mt-2 text-sm text-amber-800">尚未上传项目确认书模板，请先在品牌方合同模板页面上传。</p>}</div>}</div>
      {editing && data.canRenumber && <details className="mb-5 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm text-purple-700">管理员修改确认书编号</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="新编号"><input className={control} value={newNumber} onChange={e => setNewNumber(e.target.value)} maxLength={100} /></Field><Field label="修改原因（必填）"><input className={control} value={numberReason} onChange={e => setNumberReason(e.target.value)} maxLength={2000} /></Field><Button disabled={busy || !newNumber.trim() || !numberReason.trim()} onClick={renumber}>保存编号</Button></div></details>}
      <fieldset disabled={!editable || busy} className="min-w-0 space-y-8 disabled:opacity-80">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="确认书编号"><input className={control} readOnly value={editing?.number || "保存时自动生成：主合同编号 + 序号"} /></Field>
          <Field label="品牌 / 店铺名称"><input className={control} value={draft.brand} onChange={e => update("brand", e.target.value)} /></Field>
          <Field label="网站 / 店铺链接"><input type="url" className={control} value={draft.storeUrl} onChange={e => update("storeUrl", e.target.value)} /></Field>
          <Field label="合作开始日期"><input type="date" className={control} value={draft.startDate || ""} onChange={e => update("startDate", e.target.value || null)} /></Field>
          <Field label="合作结束日期"><input type="date" className={control} value={draft.endDate || ""} onChange={e => update("endDate", e.target.value || null)} /></Field>
          <Field label="最低合作周期（月）"><input type="number" min="0" max="120" className={control} value={draft.minimumMonths ?? ""} onChange={e => update("minimumMonths", e.target.value === "" ? null : Number(e.target.value))} /></Field>
        </div>
        <p className="text-sm text-slate-600">甲方：{data.contract.partyA || "主合同未填写"} · 联系人默认带自主合同，可按本项目约定修改。</p>
        {(["partyAContact", "partyBContact"] as const).map((key, i) => <div key={key}><h3 className="mb-3 font-medium">{i ? "乙方" : "甲方"}指定对接人</h3>{i === 1 && <label className="mb-3 block text-sm">从系统人员选择<select className={control} defaultValue="" onChange={e => { const user = data.users.find(u => u.id === e.target.value); update(key, user ? { name: user.name, email: user.email, phone: user.phone || "" } : { name: "", email: "", phone: "" }); }}><option value="">手动填写 / 修改</option>{data.users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>}<div className="grid gap-4 sm:grid-cols-3">{(["name", "email", "phone"] as const).map((k, index) => <Field key={k} label={["姓名（可修改）", "电子邮箱", "电话"][index]}><input type={k === "email" ? "email" : "text"} className={control} value={draft[key][k]} onChange={e => update(key, { ...draft[key], [k]: e.target.value })} /></Field>)}</div></div>)}
        <div><h3 className="mb-3 font-medium">乙方收款账户（可多选）</h3><div className="grid gap-2 sm:grid-cols-2">{data.bankAccounts.map(a => <label key={a.id} className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm"><input type="checkbox" className="mt-1 accent-purple-600" checked={draft.receivingAccountIds.includes(a.id)} onChange={e => update("receivingAccountIds", e.target.checked ? [...draft.receivingAccountIds, a.id] : draft.receivingAccountIds.filter(id => id !== a.id))} /><span className="min-w-0 break-words">{a.name} · {a.accountName}<span className="mt-1 block text-slate-600">{a.bankName} · {a.accountNumber}</span></span></label>)}</div>{!data.bankAccounts.length && <p className="text-sm text-amber-800">没有可用收款账户，请先在财务资料中维护对应乙方账户。</p>}</div>
        <div><h3 className="font-medium">推广范围</h3><p className="mb-3 mt-1 text-sm text-slate-600">一个国家（站点）一行；平台、Program、第三方平台可多选或手动新增。</p><div className="divide-y divide-slate-100">{draft.scopes.map((scope, i) => <div key={i} className="grid min-w-0 gap-3 py-4 sm:grid-cols-2 xl:grid-cols-4">{(["country", "salesPlatforms", "programs", "thirdPartyPlatforms"] as const).map((key, j) => <Choices key={key} label={["国家（站点）", "销售平台", "使用 Program", "第三方平台"][j]} values={key === "country" ? scope.country ? [scope.country] : [] : scope[key]} options={opts(["COUNTRY", "SALES_PLATFORM", "PROGRAM", "THIRD_PARTY_PLATFORM"][j])} multiple={key !== "country"} onChange={values => update("scopes", draft.scopes.map((s, idx) => idx === i ? { ...s, [key]: key === "country" ? values[0] || "" : values } : s))} />)}<button type="button" className="justify-self-start text-sm text-red-700" onClick={() => update("scopes", draft.scopes.filter((_, idx) => idx !== i))}>移除此行</button></div>)}</div><Button onClick={() => update("scopes", [...draft.scopes, { country: "", salesPlatforms: [], programs: [], thirdPartyPlatforms: ["无"] }])}>＋ 添加国家 / 站点</Button></div>
        <div className="space-y-3"><Field label="推广商品范围"><select className={control} value={draft.productScope} onChange={e => update("productScope", e.target.value as Draft["productScope"])}><option value="ALL">全店商品</option><option value="SPECIFIED">指定推广商品</option></select></Field>{draft.productScope === "SPECIFIED" && <>{draft.products.map((product, i) => <div key={i} className="grid gap-3 border-t border-slate-100 py-3 sm:grid-cols-2 lg:grid-cols-4">{(["name", "asinOrUrl", "country", "note"] as const).map((key, j) => key === "country" ? <Choices key={key} label="商品站点" multiple={false} values={product.country ? [product.country] : []} options={opts("COUNTRY")} onChange={v => update("products", draft.products.map((p, idx) => idx === i ? { ...p, country: v[0] || "" } : p))} /> : <Field key={key} label={["商品名称", "ASIN / 商品链接", "站点", "备注"][j]}><input className={control} value={product[key]} onChange={e => update("products", draft.products.map((p, idx) => idx === i ? { ...p, [key]: e.target.value } : p))} /></Field>)}<button type="button" className="justify-self-start text-sm text-red-700" onClick={() => update("products", draft.products.filter((_, idx) => idx !== i))}>移除商品</button></div>)}<Button onClick={() => update("products", [...draft.products, { name: "", asinOrUrl: "", country: "", note: "" }])}>＋ 添加商品</Button></>}</div>
        <Field label="服务范围说明"><textarea className={control} rows={3} value={draft.serviceDescription} onChange={e => update("serviceDescription", e.target.value)} /></Field>
        <div className="space-y-4 border-t border-slate-200 pt-5"><h3 className="font-medium">收费项目</h3><p className="text-sm text-slate-600">只为已勾选的项目生成对应费用；总包值不直接作为实际抽佣比例。</p><label className="flex gap-2 text-sm"><input type="checkbox" checked={!!draft.monthlyFee} onChange={e => update("monthlyFee", e.target.checked ? { amount: 0, currency: "USD" } : null)} />月度服务费</label>{draft.monthlyFee && <div className="grid gap-4 sm:grid-cols-2"><Field label="币种"><Currency value={draft.monthlyFee.currency} onChange={v => update("monthlyFee", { ...draft.monthlyFee!, currency: v })} /></Field><Field label="月度服务费金额"><input type="number" min="0" step="any" className={control} value={draft.monthlyFee.amount} onFocus={e => { if (draft.monthlyFee?.amount === 0) e.currentTarget.select(); }} onChange={e => update("monthlyFee", { ...draft.monthlyFee!, amount: Number(e.target.value) })} /></Field></div>}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!draft.commission} onChange={e => update("commission", e.target.checked ? { mode: "GMV_SERVICE", currency: "USD", packageValue: null, serviceRatePercent: null, basis: "ALL", threshold: null, thresholdCurrency: null, basisEvidence: "" } : null)} />销售佣金</label>
          {draft.commission && <div className="grid gap-4 sm:grid-cols-2"><Field label="佣金收费模式"><select className={control} value={draft.commission.mode} onChange={e => update("commission", { ...draft.commission!, mode: e.target.value as "GMV_SERVICE" | "PACKAGE", serviceRatePercent: null, packageValue: null })}><option value="GMV_SERVICE">GMV 服务佣金</option><option value="PACKAGE">总包佣金</option></select></Field><Field label="计佣币种"><Currency value={draft.commission.currency} onChange={v => update("commission", { ...draft.commission!, currency: v, thresholdCurrency: draft.commission!.basis === "EXCESS" ? v : draft.commission!.thresholdCurrency })} /></Field>{draft.commission.mode === "PACKAGE" ? <Field label="总包佣金"><input className={control} placeholder="填写双方约定的总包佣金" value={draft.commission.packageValue || ""} onChange={e => update("commission", { ...draft.commission!, packageValue: e.target.value })} /><span className="block text-xs text-amber-800">每期销售佣金对账时必须核定实际抽佣比例。</span></Field> : <Field label="GMV 服务佣金比例（%）"><input type="number" min="0" max="100" step="any" className={control} value={draft.commission.serviceRatePercent ?? ""} onChange={e => update("commission", { ...draft.commission!, serviceRatePercent: e.target.value === "" ? null : Number(e.target.value) })} /></Field>}<Field label="计佣范围"><select className={control} value={draft.commission.basis} onChange={e => update("commission", { ...draft.commission!, basis: e.target.value as NonNullable<Draft["commission"]>["basis"], thresholdCurrency: e.target.value === "EXCESS" ? draft.commission!.currency : null })}><option value="ALL">全量销售计佣</option><option value="CAMPAIGN">按 Campaign 区分存量 / 增量</option><option value="PUBLISHER">按 Publisher / 联盟伙伴区分</option><option value="EXCESS">按销售额门槛（仅超出部分）</option></select></Field>{draft.commission.basis === "EXCESS" && <><Field label="月度销售额门槛"><input type="number" min="0" step="any" className={control} value={draft.commission.threshold ?? ""} onChange={e => update("commission", { ...draft.commission!, threshold: e.target.value === "" ? null : Number(e.target.value) })} /></Field><Field label="门槛币种（须与计佣币种一致）"><Currency value={draft.commission.thresholdCurrency || draft.commission.currency} onChange={v => update("commission", { ...draft.commission!, thresholdCurrency: v })} /></Field></>}<div className="sm:col-span-2"><Field label="存量 / 增量规则、资源清单与确认依据"><textarea rows={3} className={control} value={draft.commission.basisEvidence} onChange={e => update("commission", { ...draft.commission!, basisEvidence: e.target.value })} /></Field></div></div>}
          {draft.additionalFees.map((fee, i) => <div key={i} className="grid gap-3 border-t border-slate-100 py-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="其他收费类型"><select className={control} value={fee.kind} onChange={e => update("additionalFees", draft.additionalFees.map((f, idx) => idx === i ? { ...f, kind: e.target.value as "FIXED_PROJECT" | "OTHER" } : f))}><option value="FIXED_PROJECT">固定项目费</option><option value="OTHER">其他</option></select></Field>{(["description", "amount", "paymentTerms"] as const).map(key => <Field key={key} label={{ description: "费用说明", amount: "金额", paymentTerms: "付款安排" }[key]}><input className={control} type={key === "amount" ? "number" : "text"} min={key === "amount" ? 0 : undefined} step="any" value={fee[key]} onChange={e => update("additionalFees", draft.additionalFees.map((f, idx) => idx === i ? { ...f, [key]: key === "amount" ? Number(e.target.value) : e.target.value } : f))} /></Field>)}<Field label="币种"><Currency value={fee.currency} onChange={v => update("additionalFees", draft.additionalFees.map((f, idx) => idx === i ? { ...f, currency: v } : f))} /></Field><button type="button" className="justify-self-start text-sm text-red-700" onClick={() => update("additionalFees", draft.additionalFees.filter((_, idx) => idx !== i))}>移除此费用</button></div>)}<Button onClick={() => update("additionalFees", [...draft.additionalFees, { kind: "FIXED_PROJECT", description: "", amount: 0, currency: "USD", paymentTerms: "" }])}>＋ 添加固定项目费 / 其他收费</Button>
        </div>
        <div className="space-y-4"><h3 className="font-medium">结算与归因约定</h3><Choices label="销售数据来源（可多选）" values={draft.salesSources} options={opts("SALES_SOURCE")} onChange={v => update("salesSources", v)} /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(["attributionWindowDays", "orderLockDays", "tailDays"] as const).map((key, i) => <Field key={key} label={["归因窗口（天）", "订单锁定期（天）", "终止后尾期（天）"][i]}><input className={control} type="number" min="0" max="365" value={draft[key]} onChange={e => update(key, Number(e.target.value))} /></Field>)}<Field label="税费口径"><select className={control} value={draft.taxBasis} onChange={e => update("taxBasis", e.target.value as Draft["taxBasis"])}><option value="EXCLUSIVE">不含税</option><option value="INCLUSIVE">含税</option></select></Field></div>{(["tailTerms", "paymentTerms", "note"] as const).map((key, i) => <Field key={key} label={["尾期计佣约定", "付款与结算约定", "其他备注"][i]}><textarea className={control} rows={3} value={draft[key]} onChange={e => update(key, e.target.value)} /></Field>)}</div>
        {editing && <Field label="修改原因"><textarea className={control} rows={2} value={reason} onChange={e => setReason(e.target.value)} /></Field>}
        {editable && <Button variant="primary" loading={busy} onClick={save}>{replacement ? "保存替换草稿" : "保存草稿"}</Button>}
      </fieldset>
      {editing && <div className="mt-8 space-y-4 border-t border-slate-200 pt-5"><h3 className="font-medium">签署原件与生效</h3><p className="text-sm text-slate-600">上传只存档原件，不自动识别字段。生效前请先保存表单并核对原件；生效后本版本不可直接编辑。</p>{editing.signedFileUrl && <a className="inline-block text-sm text-purple-700" href={`${base}/${editing.id}?download=1`}>下载已上传原件</a>}{editable && <div className="flex flex-wrap items-center gap-3"><input aria-label="上传签署确认书原件" type="file" accept=".pdf,.doc,.docx" disabled={busy} onChange={e => setFile(e.target.files?.[0] || null)} className="max-w-full text-sm" /><Button disabled={busy || !file} onClick={upload}>上传原件</Button></div>}{data.canManage && data.contract.contractMode === "FRAMEWORK" && data.contract.status === "COMPLETED" && editing.status === "DRAFT" && editing.signedFileUrl && <Button variant="primary" loading={busy} onClick={activate}>确认生效并生成独立对账</Button>}<p className="text-xs text-slate-600">当前版本 v{editing.version} · 历史版本 {editing.versions?.length || 0} 份</p></div>}
    </section>}
  </div>;
}
