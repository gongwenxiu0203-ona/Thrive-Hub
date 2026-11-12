"use client";
import { useEffect, useState } from "react";
type Policy = { entityType: string; reviewRequired: boolean; defaultReviewerId: string; defaultProcessorId: string; version: number };
type Account = { id: string; name: string; email: string };
const labels: Record<string, string> = { BILLING_REQUEST: "开票申请（国内发票 / Invoice）", PAYMENT_REQUEST: "付款申请", EXPENSE_CLAIM: "费用报销" };
export function FinanceApprovalSettingsPanel({ canManage }: { canManage: boolean }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [users, setUsers] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch("/api/admin/finance-approval-policies", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "读取审批配置失败");
    setPolicies(body.policies); setUsers(body.users);
  }
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  function change(index: number, patch: Partial<Policy>) { setMessage(""); setPolicies(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row)); }
  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/finance-approval-policies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policies }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败");
      await load(); setMessage("已保存：新申请和重新提交立即使用新配置，在途申请保持原配置。");
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试"); }
    finally { setSaving(false); }
  }
  function accounts(value: string) {
    return <>{value && !users.some(user => user.id === value) && <option value={value}>原账号已停用或移除，请重新选择</option>}{users.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</>;
  }
  return <section className="card space-y-5 p-5">
    <header><h2 className="text-lg font-semibold">财务流程审批配置</h2><p className="mt-2 max-w-3xl text-sm text-slate-700">按申请类型设置默认审核人，申请人仍可更换。选择“不需要审核”只跳过初审，开票、实际付款、凭证及核销仍须由有权限人员完成。配置不会追溯修改在途申请。</p></header>
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {loading ? <p role="status">正在读取审批配置…</p> : policies.map((policy, index) => <fieldset key={policy.entityType} disabled={!canManage || saving} className="space-y-3 border-t border-slate-200 pt-4">
      <legend className="font-medium">{labels[policy.entityType]}</legend>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm"><span className="label">初审要求</span><select className="input" value={policy.reviewRequired ? "REQUIRE" : "SKIP"} onChange={event => change(index, { reviewRequired: event.target.value === "REQUIRE" })}><option value="REQUIRE">需要审核</option><option value="SKIP">不需要审核</option></select></label>
        <label className="block text-sm"><span className="label">默认审核人</span><select className="input" disabled={!policy.reviewRequired} value={policy.defaultReviewerId} onChange={event => change(index, { defaultReviewerId: event.target.value })}><option value="">请选择内部账号</option>{accounts(policy.defaultReviewerId)}</select></label>
        <label className="block text-sm"><span className="label">默认财务经办人（可选）</span><select className="input" value={policy.defaultProcessorId} onChange={event => change(index, { defaultProcessorId: event.target.value })}><option value="">由具备权限的财务人员处理</option>{accounts(policy.defaultProcessorId)}</select></label>
      </div>
    </fieldset>)}
    <p className="text-xs text-slate-600">经办人分配不会授予财务权限；停用或移除默认账号后，需在这里更新配置。</p>
    <div className="flex justify-end"><button className="btn-primary" disabled={!canManage || loading || saving || policies.length !== 3} onClick={save}>{saving ? "保存中…" : "保存审批配置"}</button></div>
  </section>;
}
