"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { defaultContractAccountIds } from "@/lib/contractAccountSelection";

type Account = { id: string; name: string; legalEntity: string; legalEntityKey?: string | null; accountName: string; accountNumber: string; currency: string; status?: string };
export type FrameworkInitial = { id: string; updatedAt: string; customerId: string | null; ownerId: string | null; reviewerId: string | null; templateId: string | null; partyBCompany: string | null; receivingAccountIds: string[] } & Partial<Record<"partyA" | "partyACreditCode" | "partyAAddress" | "partyAContact" | "partyAPhone" | "partyAEmail" | "partyBContact" | "partyBEmail" | "partyBPhone" | "remark", string | null>>;
type Props = { mode: "create" | "upload"; existing?: FrameworkInitial; presetCustomerId?: string; templates: { id: string; name: string }[]; customers: Array<{ id: string; brandName: string }>; users: Array<{ id: string; name: string; email: string; phone: string | null }>; accounts: Account[]; currentUserId: string; defaultReviewerId?: string; partyBOptions: Array<{ key: string; label: string; name: string }> };

export function FrameworkContractForm({ mode, existing, presetCustomerId, templates, customers, users, accounts, currentUserId, defaultReviewerId, partyBOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [partyB, setPartyB] = useState(existing?.partyBCompany || partyBOptions[0]?.key || "");
  const [error, setError] = useState("");
  const [contact, setContact] = useState({ name: existing?.partyBContact || "", email: existing?.partyBEmail || "", phone: existing?.partyBPhone || "" });
  const partyBOption = partyBOptions.find((item) => item.key === partyB);
  const defaultAccountIds = useMemo(() => {
    const defaults = new Set(existing && partyB === existing.partyBCompany ? existing.receivingAccountIds : defaultContractAccountIds(accounts, partyB));
    return accounts.filter((item) => defaults.has(item.id)).map((item) => item.id);
  }, [accounts, partyB, existing]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() => defaultAccountIds);

  function changePartyB(nextPartyB: string) {
    setPartyB(nextPartyB);
    setSelectedAccountIds(defaultContractAccountIds(accounts, nextPartyB));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!formElement.reportValidity()) return;

    // Snapshot the browser form synchronously. Passing React's action FormData
    // into a deferred transition caused large multipart forms (notably the
    // signed contract upload) to arrive at the server without their text and
    // checkbox fields.
    const form = new FormData(formElement);
    if (!existing) {
      const missing = [
        !String(form.get("customerId") ?? "").trim() ? "关联客户" : null,
        !String(form.get("partyA") ?? "").trim() ? "甲方公司名称/发票抬头" : null,
        !String(form.get("partyBCompany") ?? "").trim() ? "乙方签约主体" : null,
        form.getAll("receivingAccountIds").length === 0 ? "乙方收款账户" : null,
      ].filter(Boolean);
      if (missing.length) {
        setError(`请补充：${missing.join("、")}`);
        return;
      }
    }

    startTransition(async () => {
      setError("");
      try {
        const response = await fetch("/api/contracts/framework-submit", {
          method: "POST",
          body: form,
        });
        const result = await response.json() as { ok: true; id: string } | { ok: false; error: string };
        if (!response.ok || !result.ok) {
          return setError(result.ok ? "保存主合同失败，请重试" : result.error);
        }
        router.push(`/contracts/${result.id}/confirmations`);
        router.refresh();
      } catch {
        setError("上传请求中断，请检查网络后重试；已填写内容仍保留在当前页面");
      }
    });
  }

  return <form className="card space-y-7 p-4 sm:p-6" onSubmit={submit} encType="multipart/form-data">
    <input type="hidden" name="flow" value={mode} />
    {existing && <><input type="hidden" name="contractId" value={existing.id} /><input type="hidden" name="expectedUpdatedAt" value={existing.updatedAt} /></>}
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4"><div><h2 className="font-semibold text-slate-900">主合同资料</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">两个入口使用同一套字段。合作范围、国家站点、平台及收费条款不在主合同重复填写。</p></div><a href="/contracts/templates?scope=brand" target="_blank" rel="noreferrer" className="text-sm text-brand-700 hover:underline">查看 / 上传品牌方模板 ↗</a></div>
    <section className="space-y-4"><h3 className="text-sm font-semibold text-slate-800">基本信息</h3><div className="grid gap-4 md:grid-cols-2">
      <Field label="关联客户 *"><select name="customerId" disabled={!!existing} defaultValue={existing?.customerId || presetCustomerId || ""} required className="input"><option value="">请选择</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.brandName}</option>)}</select></Field>
      <Field label="合同负责人 *"><select name="ownerId" defaultValue={existing?.ownerId || currentUserId} required className="input">{users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      {(existing || mode === "create") && <Field label="审核人 *"><select name="reviewerId" defaultValue={existing?.reviewerId || defaultReviewerId || ""} required className="input"><option value="">请选择审核人</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name}{item.email ? ` · ${item.email}` : ""}</option>)}</select><span className="block text-xs font-normal text-slate-500">网站创建合同默认 Shallow Wan，可手动改选其他内部账号。</span></Field>}
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
      <Field label="乙方签约主体 *"><select name="partyBCompany" value={partyB} onChange={(e) => changePartyB(e.target.value)} required className="input">{partyBOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></Field>
      <Field label="乙方公司名称"><input className="input bg-slate-50" readOnly value={partyBOption?.name ?? ""} /></Field>
    </div></section>
    <section className="space-y-4"><h3 className="text-sm font-semibold text-slate-800">乙方指定对接人</h3><div className="grid gap-4 md:grid-cols-2">
      <Field label="从系统人员带出"><select className="input" defaultValue="" onChange={(e) => { const user = users.find((u) => u.id === e.target.value); setContact(user ? { name: user.name, email: user.email, phone: user.phone ?? "" } : { name: "", email: "", phone: "" }); }}><option value="">手动填写对接人</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label={`姓名（可手动修改）${!existing && mode === "upload" ? " *" : ""}`}><input className="input" name="partyBContact" required={!existing && mode === "upload"} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field>
      <Field label={`电子邮箱${!existing && mode === "upload" ? " *" : ""}`}><input className="input" type="email" name="partyBEmail" required={!existing && mode === "upload"} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
      <Field label={`电话${!existing && mode === "upload" ? " *" : ""}`}><input className="input" type="tel" name="partyBPhone" required={!existing && mode === "upload"} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
    </div></section>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold text-slate-800">乙方收款账户（可多选）*</legend><p className="text-xs text-slate-500">展示所有启用公司账户，默认勾选签约主体关联账户；原合同停用账户可保留历史快照。</p>{accounts.length ? <div className="grid gap-2 md:grid-cols-2">{accounts.map((account) => <label key={account.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" name="receivingAccountIds" value={account.id} checked={selectedAccountIds.includes(account.id)} onChange={(event) => setSelectedAccountIds((current) => event.target.checked ? [...new Set([...current, account.id])] : current.filter((id) => id !== account.id))} className="mt-1 accent-brand-600" /><span className="min-w-0 break-all"><b>{account.name}</b>{account.status && account.status !== "ACTIVE" && <span className="ml-2 text-xs text-amber-700">已停用 · 历史账户</span>}<br/><span className="text-slate-500">{account.accountName} · 尾号 {account.accountNumber.slice(-4)}</span></span></label>)}</div> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">暂无启用的公司付款账户，请先在财务资料中维护。</p>}</fieldset>
    <section className="space-y-3"><h3 className="text-sm font-semibold text-slate-800">合同模板与文件</h3><Field label={!existing && mode === "create" ? "合同模板 *" : "合同模板（可选）"}><select name="templateId" required={!existing && mode === "create"} className="input" defaultValue={existing ? existing.templateId || "" : templates[0]?.id || ""}><option value="">请选择主格式合同模板</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>{!templates.length && <p className="text-sm text-amber-800">暂无主格式合同模板，请先从本页右上角模板入口上传。</p>}{existing ? <p className="text-sm text-slate-600">本次只修改主合同资料，不替换签署原件、不重写已有确认书或对账。</p> : mode === "upload" ? <div className="space-y-3"><Field label="已签署主格式合同原件 *"><input name="file" type="file" accept=".pdf,.doc,.docx" required className="input" /></Field><label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" name="signedConfirmed" value="true" required defaultChecked className="mt-1" />确认上传文件为双方已签字/盖章的完整主格式合同原件；资料补充完整后直接标记签署完成</label></div> : <p className="text-sm text-slate-500">保存为主合同草稿，继续填写项目确认书后选择导出范围。未上传签署原件前不会标记签署完成。</p>}</section>
    <Field label="备注"><textarea name="remark" defaultValue={existing?.remark || ""} rows={3} className="input" /></Field>
    {existing && <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <Field label="本次修改原因 *">
        <textarea
          name="changeReason"
          required
          maxLength={2000}
          rows={3}
          className="input bg-white"
          placeholder="请说明修改了哪些合同信息及修改原因；保存后将写入操作审计记录"
        />
      </Field>
      <p className="mt-2 text-xs text-amber-800">修改原因必填，最多 2000 字；不会展示在合同正文中。</p>
    </section>}
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row"><Button type="submit" disabled={pending || !accounts.length}>{pending ? "保存中…" : existing ? "填写原因并保存主合同修改" : mode === "upload" ? "归档并进入项目确认书" : "创建并进入项目确认书"}</Button></div>
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>; }
