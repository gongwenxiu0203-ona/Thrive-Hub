"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

type ReviewRow = {
  id: string;
  affiliateId: string;
  customerName: string | null;
  customerId: string | null;
  platform: string | null;
  notes: string | null;
  reviewerName: string | null;
  customerStatus: string | null;
  createdAt: string | Date;
  affiliate: {
    id: string;
    platformAffiliateName: string;
    personInCharge: { id: string; name: string } | null;
  };
};

interface Props {
  users: { id: string; name: string }[];
  customers: { id: string; brandName: string }[];
}

export default function CoopReviewsTab({ users, customers }: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [affiliateName, setAffiliateName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchReviews = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (affiliateName) p.set("affiliateName", affiliateName);
    if (customerId)    p.set("customerId", customerId);
    if (reviewerId)    p.set("reviewerId", reviewerId);
    if (dateFrom)      p.set("dateFrom", dateFrom);
    if (dateTo)        p.set("dateTo", dateTo);
    fetch(`/api/affiliates/coop-reviews?${p}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [affiliateName, customerId, reviewerId, dateFrom, dateTo]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  function reset() {
    setAffiliateName(""); setCustomerId(""); setReviewerId("");
    setDateFrom(""); setDateTo("");
  }

  const hasFilter = !!(affiliateName || customerId || reviewerId || dateFrom || dateTo);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">筛选器</p>
          {hasFilter && (
            <button onClick={reset} className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500">
              <X className="h-3 w-3" />清空
            </button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* Affiliate name search */}
          <div>
            <p className="mb-1 text-[11px] text-slate-500">平台联盟商名称</p>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={affiliateName} onChange={e => setAffiliateName(e.target.value)}
                placeholder="搜索名称…"
                className="h-[30px] w-full rounded border border-slate-200 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>

          {/* Customer */}
          <div>
            <p className="mb-1 text-[11px] text-slate-500">关联客户</p>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
              className="h-[30px] w-full rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">全部客户</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.brandName}</option>)}
            </select>
          </div>

          {/* Reviewer / Person in charge */}
          <div>
            <p className="mb-1 text-[11px] text-slate-500">提交人 / 负责人</p>
            <select value={reviewerId} onChange={e => setReviewerId(e.target.value)}
              className="h-[30px] w-full rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">全部</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Date range */}
          <div className="sm:col-span-2 xl:col-span-2">
            <p className="mb-1 text-[11px] text-slate-500">提交时间</p>
            <div className="flex items-center gap-1">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-[30px] flex-1 min-w-0 rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <span className="text-slate-400 text-xs">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="h-[30px] flex-1 min-w-0 rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <p className="text-xs text-slate-500">共 {rows.length} 条审核记录</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <th className="px-4 py-3 text-left font-medium">平台联盟商名称</th>
              <th className="px-4 py-3 text-left font-medium">关联客户</th>
              <th className="px-4 py-3 text-left font-medium">合作平台</th>
              <th className="px-4 py-3 text-left font-medium">负责人</th>
              <th className="px-4 py-3 text-left font-medium">提交人</th>
              <th className="px-4 py-3 text-left font-medium">客户状态</th>
              <th className="px-4 py-3 text-left font-medium">提交时间</th>
              <th className="px-4 py-3 text-left font-medium">备注</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center text-slate-400">加载中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-slate-400">暂无审核记录</td></tr>
            ) : rows.map(r => {
              const isExp = expanded === r.id;
              return (
                <>
                  <tr key={r.id}
                    className="border-b border-slate-50 cursor-pointer hover:bg-slate-50/50"
                    onClick={() => setExpanded(isExp ? null : r.id)}>
                    <td className="px-4 py-2.5 font-medium text-brand-700 hover:underline">
                      <a href={`/affiliates/${r.affiliateId}`} onClick={e => e.stopPropagation()}>
                        {r.affiliate.platformAffiliateName}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.customerName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600 max-w-[200px] truncate" title={r.platform ?? ""}>{r.platform || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.affiliate.personInCharge?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.reviewerName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.customerStatus ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600">{r.customerStatus}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[160px] truncate" title={r.notes ?? ""}>
                      {r.notes ? r.notes.slice(0, 40) + (r.notes.length > 40 ? "…" : "") : "—"}
                    </td>
                  </tr>
                  {isExp && r.notes && (
                    <tr key={r.id + "-exp"} className="bg-slate-50/60 border-b border-slate-100">
                      <td colSpan={8} className="px-6 py-3">
                        <p className="text-[11px] font-medium text-slate-500 mb-1">完整备注</p>
                        <pre className="whitespace-pre-wrap text-xs text-slate-600 font-sans">{r.notes}</pre>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
