"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptBillingRequest } from "@/actions/billingRequests";

type Row = { id: string; requestNo: string; documentType: string; mergeMode: string; status: string; currency: string; requestedAmount: number; submittedAt: string; acceptedAt: string | null; customer: { brandName: string }; applicant: { name: string }; acceptedBy: { name: string } | null; lines: Array<{ id: string; feeType: string; requestedAmount: number; currency: string }>; invoices: Array<{ id: string; invoiceNo: string; status: string }> };
const labels: Record<string, string> = { SUBMITTED: "待受理", PROCESSING: "处理中", COMPLETED: "已开票", REJECTED: "已驳回", CANCELLED: "已取消" };

export function BillingWorkbenchClient({ requests, canEdit }: { requests: Row[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const counts = { submitted: requests.filter((r) => r.status === "SUBMITTED").length, processing: requests.filter((r) => r.status === "PROCESSING").length, completed: requests.filter((r) => r.status === "COMPLETED").length };
  function accept(id: string, documentType: string) { startTransition(async () => { setError(""); const result = await acceptBillingRequest(id); if (!result.ok) setError(result.error ?? "受理失败。"); else { router.push(documentType === "DOMESTIC" ? `/finance/billing/${encodeURIComponent(id)}/domestic` : `/invoices/new?billingRequestId=${encodeURIComponent(id)}`); router.refresh(); } }); }
  return <>
    <div className="grid gap-3 sm:grid-cols-3"><Stat label="待受理" value={counts.submitted} /><Stat label="处理中" value={counts.processing} /><Stat label="已开票" value={counts.completed} /></div>
    {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">申请</th><th className="px-4 py-3">客户 / 申请人</th><th className="px-4 py-3">类型</th><th className="px-4 py-3 text-right">金额</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{requests.map((r) => <tr key={r.id}><td className="px-4 py-3"><p className="font-medium text-slate-900">{r.requestNo}</p><p className="text-xs text-slate-500">{new Date(r.submittedAt).toLocaleString("zh-CN")}</p></td><td className="px-4 py-3"><p>{r.customer.brandName}</p><p className="text-xs text-slate-500">{r.applicant.name}</p></td><td className="px-4 py-3">{r.documentType === "DOMESTIC" ? "国内发票" : "Invoice"}<p className="text-xs text-slate-500">{r.mergeMode === "MERGED" ? `合并 ${r.lines.length} 条` : "分别开票"}</p></td><td className="px-4 py-3 text-right font-medium">{r.currency} {r.requestedAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{labels[r.status] ?? r.status}</span></td><td className="px-4 py-3 text-right">{r.invoices[0] ? <Link className="text-brand-700 hover:underline" href={`/invoices/${r.invoices[0].id}`}>查看 {r.invoices[0].invoiceNo}</Link> : r.status === "SUBMITTED" && canEdit ? <button className="btn-primary" disabled={pending} onClick={() => accept(r.id, r.documentType)}>受理并开票</button> : r.status === "PROCESSING" ? <Link className="btn-secondary" href={r.documentType === "DOMESTIC" ? `/finance/billing/${r.id}/domestic` : `/invoices/new?billingRequestId=${r.id}`}>继续开票</Link> : <span className="text-slate-400">—</span>}</td></tr>)}</tbody></table>
      {!requests.length && <p className="p-10 text-center text-sm text-slate-500">暂无开票申请。</p>}
    </div>
  </>;
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p></div>; }
