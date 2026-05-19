"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertCircle } from "lucide-react";

type PreviewRow = {
  id: string;
  orderDate: string;
  brand: string;
  affiliatePlatform: string;
  affiliateName: string;
  store: string | null;
  region: string | null;
  revenue: number;
};

interface Props {
  totalCount: number;
  previewRows: PreviewRow[];
  filterJson: string;
}

export function CleanupPanel({ totalCount, previewRows, filterJson }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function clear() {
    if (totalCount === 0) return;
    if (!confirm(`确认清理 ${totalCount.toLocaleString()} 条销售记录？此操作不可撤销。`)) return;
    setError(null);
    setDone(null);
    startTransition(async () => {
      const filter = JSON.parse(filterJson);
      const res = await fetch("/api/sales/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "清理失败");
      } else {
        setDone(`已清理 ${data.deleted} 条销售记录`);
        router.refresh();
      }
    });
  }

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">数据清理</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            使用上方筛选器筛选后，预览匹配数据并一键清除。
          </p>
        </div>
        <button
          className="btn-danger flex items-center gap-2"
          disabled={pending || totalCount === 0}
          onClick={clear}
        >
          <Trash2 className="h-4 w-4" />
          {pending ? "清理中…" : totalCount > 0 ? `一键清除 ${totalCount.toLocaleString()} 条` : "无匹配数据"}
        </button>
      </div>

      {totalCount > 0 ? (
        <div>
          <p className="mb-2 text-xs text-slate-500">
            当前筛选匹配 <span className="font-semibold text-rose-600">{totalCount.toLocaleString()}</span> 条记录
            {previewRows.length < totalCount && `，以下展示前 ${previewRows.length} 条预览`}
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-medium text-slate-500">订单日期</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">品牌</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">平台</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">联盟商</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">店铺</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">地区</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">销售额</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-slate-500">{r.orderDate.slice(0, 10)}</td>
                    <td className="px-3 py-1.5 font-medium">{r.brand}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.affiliatePlatform}</td>
                    <td className="px-3 py-1.5">{r.affiliateName}</td>
                    <td className="px-3 py-1.5 text-slate-400">{r.store ?? "—"}</td>
                    <td className="px-3 py-1.5 text-slate-400">{r.region ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">${r.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 py-12 text-sm text-slate-400">
          无匹配数据，请调整筛选条件
        </div>
      )}

      {error && (
        <div className="flex gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {done && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">{done}</p>
      )}
    </section>
  );
}
