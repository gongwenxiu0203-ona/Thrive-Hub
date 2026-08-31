"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFrameworkContract, updateFrameworkContract } from "@/actions/contractFramework";
import { Button } from "@/components/ui/Button";
import { defaultContractAccountIds } from "@/lib/contractAccountSelection";

type Account = { id: string; name: string; legalEntity: string; legalEntityKey?: string | null; accountName: string; accountNumber: string; currency: string; status?: string };
export type FrameworkInitial = { id: string; updatedAt: string; customerId: string | null; ownerId: string | null; templateId: string | null; partyBCompany: string | null; receivingAccountIds: string[] } & Partial<Record<"partyA" | "partyACreditCode" | "partyAAddress" | "partyAContact" | "partyAPhone" | "partyAEmail" | "partyBContact" | "partyBEmail" | "partyBPhone" | "remark", string | null>>;
type Props = { mode: "create" | "upload"; existing?: FrameworkInitial; presetCustomerId?: string; templates: { id: string; name: string }[]; customers: Array<{ id: string; brandName: string }>; users: Array<{ id: string; name: string; email: string; phone: string | null }>; accounts: Account[]; currentUserId: string; partyBOptions: Array<{ key: string; label: string; name: string }> };

export function FrameworkContractForm({ mode, existing, presetCustomerId, templates, customers, users, accounts, currentUserId, partyBOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [partyB, setPartyB] = useState(existing?.partyBCompany || partyBOptions[0]?.key || "");
  const [error, setError] = useState("");
  const [contact, setContact] = useState({ name: existing?.partyBContact || "", email: existing?.partyBEmail || "", phone: existing?.partyBPhone || "" });
  const partyBOption = partyBOptions.find((item) => item.key === partyB);
  const availableAccounts = useMemo(() => {
    const defaults = new Set(existing && partyB === existing.partyBCompany ? existing.receivingAccountIds : defaultContractAccountIds(accounts, partyB));
    return accounts.filter((item) => defaults.has(item.id));
  }, [accounts, partyB, existing]);
  return <form className="card space-y-7 p-4 sm:p-6" action={(form) => startTransition(async () => {
    setError("");
    const result = await (existing ? updateFrameworkContract(form) : createFrameworkContract(form));
    if (!result.ok) return setError(result.error);
    router.push(`/contracts/${result.id}/confirmations`);
    router.refresh();
  })}>
    <input type="hidden" name="flow" value={mode} />
    {existing && <><input type="hidden" name="contractId" value={existing.id} /><input type="hidden" name="expectedUpdatedAt" value={existing.updatedAt} /></>}
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4"><div><h2 className="font-semibold text-slate-900">主合同资料</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">两个入口使用同一套字段。合作范围、国家站点、平台及收费条款不在主合同重复填写。</p></div><a href="/contracts/templates?scope=brand" target="_blank" rel="noreferrer" className="text-sm text-brand-700 hover:underline">查看 / 上传品牌方模板 ↗</a></div>
    <section className="space-y-4"><h3 className="text-sm font-semibold text-slate-800">基本信息</h3><div className="grid gap-4 md:grid-cols-2">
      <Field label="关联客户 *"><select name="customerId" disabled={!!existing} defaultValue={existing?.customerId || presetCustomerId || ""} required className="input"><option value="">请选择</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.brandName}</option>)}</select></Field>
      <Field label="合同负责人 *"><select name="ownerId" defaultValue={existing?.ownerId || currentUserId} required className="input">{users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    </div></section>
    <section className="space-y-4"><h3 className="text-sm font-semibold text-slate-800">甲方信息</h3><div className="grid gap-4 md:grid-cols-2">
      <Field label="甲方公司名称/发票抬头 *"><input name="partyA" defaultValue={existing?.partyA || ""} required className="input" /></Field>
      <Field label={`甲方统一社会信用代码${!existing && mode === "upload" ? " *" : ""}`}><input name="partyACreditCode" defaultValue={existing?.partyACreditCode || ""} required={!existing && mode === "upload"} className="input" /></Field>
      <Field label={`甲方地址${!existing && mode === "upload" ? " *" : ""}`}><input name="partyAAddress" defaultValue={existing?.partyAAddress || ""} required={!existing && mode === "upload"} className="input" /></Field>
      <Field label={`甲方联系人${!existing && mode === "upload" ? " *" : ""}`}><input name="partyAContact" defaultValue={existing?.partyAContact || ""} required={!existing && mode === "upload"} className="input" /></Field>
      <Field label={`甲方联系电话${!existing && mode === "upload" ? " *" : ""}`}><input name="partyAPhone" defaultValue={existing?.partyAPhone || ""} required={!existing && mode === "upload"} type="tel" className="input" /></Field>
      <Field label={`甲方联系邮箱${!existing && mode === "upload" ? " *" : ""}`}><input name="partyAEmail" defaultValue={existing?.partyAEmail || ""} required={!existing && mode === "upload"} type="email" className="input" /></Field>
    </div></section>
    <section className="space-y-4"><h3 className="text-sm font-semibold text-slate-800">乙方主体</h3><div className="grid gap-4 md:grid-cols-2">
      <Field label="乙方签约主体 *"><select name="partyBCompany" value={partyB} onChange={(e) => setPartyB(e.target.value)} required className="input">{partyBOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></Field>
      <Field label="乙方公司名称"><input className="input bg-slate-50" readOnly value={partyBOption?.name ?? ""} /></Field>
    </div></section>
    <section className="space-y-4"><h3 className="text-sm font-semibold text-slate-800">乙方指定对接人</h3><div className="grid gap-4 md:grid-cols-2">
      <Field label="从系统人员带出"><select className="input" defaultValue="" onChange={(e) => { const user = users.find((u) => u.id === e.target.value); setContact(user ? { name: user.name, email: user.email, phone: user.phone ?? "" } : { name: "", email: "", phone: "" }); }}><option value="">手动填写对接人</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label={`姓名（可手动修改）${!existing && mode === "upload" ? " *" : ""}`}><input className="input" name="partyBContact" required={!existing && mode === "upload"} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
      <Field label={`电子邮箱${!existing && mode === "upload" ? " *" : ""}`}><input className="input" type="email" name="partyBEmail" required={!existing && mode === "upload"} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
      <Field label={`电话${!existing && mode === "upload" ? " *" : ""}`}><input className="input" type="tel" name="partyBPhone" required={!existing && mode === "upload"} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
    </div></section>
    <fieldset key={partyB} className="space-y-2"><legend className="text-sm font-semibold text-slate-800">乙方收款账户（可多选）*</legend><p className="text-xs text-slate-500">展示所有启用公司账户，默认勾选签约主体关联账户；原合同停用账户可保留历史快照。</p>{accounts.length ? <div className="grid gap-2 md:grid-cols-2">{accounts.map((account) => <label key={account.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" name="receivingAccountIds" value={account.id} defaultChecked={availableAccounts.some((item) => item.id === account.id)} className="mt-1 accent-brand-600" /><span className="min-w-0 break-all"><b>{account.name}</b>{account.status && account.status !== "ACTIVE" && <span className="ml-2 text-xs text-amber-700">已停用 · 历史账户</span>}<br/><span className="text-slate-500">{account.accountName} · 尾号 {account.accountNumber.slice(-4)}</span></span></label>)}</div> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">暂无启用的公司付款账户，请先在财务资料中维护。</p>}</fieldset>
    <section className="space-y-3"><h3 className="text-sm font-semibold text-slate-800">合同模板与文件</h3><Field label={!existing && mode === "create" ? "合同模板 *" : "合同模板（可选）"}><select name="templateId" required={!existing && mode === "create"} className="input" defaultValue={existing ? existing.templateId || "" : templates[0]?.id || ""}><option value="">请选择主格式合同模板</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>{!templates.length && <p className="text-sm text-amber-800">暂无主格式合同模板，请先从本页右上角模板入口上传。</p>}{existing ? <p className="text-sm text-slate-600">本次只修改主合同资料，不替换签署原件、不重写已有确认书或对账。</p> : mode === "upload" ? <div className="space-y-3"><Field label="已签署主格式合同原件 *"><input name="file" type="file" accept=".pdf,.doc,.docx" required className="input" /></Field><label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" name="signedConfirmed" value="true" required className="mt-1" />确认上传文件为双方已签字/盖章的完整主格式合同原件；资料补充完整后直接标记签署完成</label></div> : <p className="text-sm text-slate-500">保存为主合同草稿，继续填写项目确认书后选择导出范围。未上传签署原件前不会标记签署完成。</p>}</section>
    <Field label="备注"><textarea name="remark" defaultValue={existing?.remark || ""} rows={3} className="input" /></Field>
    {existing && <Field label="修改原因 *"><textarea name="changeReason" required maxLength={2000} rows={2} className="input" /></Field>}
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row"><Button type="submit" disabled={pending || !accounts.length}>{pending ? "保存中…" : existing ? "保存主合同修改" : mode === "upload" ? "归档并进入项目确认书" : "创建并进入项目确认书"}</Button></div>
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>; }
