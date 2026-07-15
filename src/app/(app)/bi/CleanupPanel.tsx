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

type ClearResponse = {
  error?: string;
  count?: number;
  confirmationToken?: string;
  expiresAt?: string;
  deleted?: number;
};

export function CleanupPanel({ totalCount, previewRows, filterJson }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function clear() {
    if (totalCount === 0 || pending) return;
    if (!confirm(`将先由服务器核验 ${totalCount.toLocaleString()} 条匹配记录，是否继续？`)) return;

    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const filter = JSON.parse(filterJson);
        const previewResponse = await fetch("/api/sales/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filter, dryRun: true }),
        });
        const preview = (await previewResponse.json()) as ClearResponse;
        if (!previewResponse.ok) {
          setError(preview.error ?? "服务器预览失败，请稍后重试");
          return;
        }
        if (
          typeof preview.count !== "number" ||
          !preview.confirmationToken ||
          !preview.expiresAt
        ) {
          setError("服务器没有返回有效的清理确认信息，请勿继续操作");
          return;
        }
        if (preview.count !== totalCount) {
          setError(
            `数据已发生变化：页面显示 ${totalCount.toLocaleString()} 条，服务器当前为 ${preview.count.toLocaleString()} 条。请刷新页面后重新确认。`,
          );
          router.refresh();
          return;
        }
        if (preview.count === 0) {
          setDone("当前筛选条件已没有可清理的数据");
          router.refresh();
          return;
        }

        const expiry = new Date(preview.expiresAt).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        if (
          !confirm(
            `服务器已确认将清理 ${preview.count.toLocaleString()} 条销售记录。\n确认令牌将在 ${expiry} 失效。\n\n此操作不可撤销，是否正式执行？`,
          )
        ) {
          return;
        }

        const executeResponse = await fetch("/api/sales/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filter,
            dryRun: false,
            confirmationToken: preview.confirmationToken,
          }),
        });
        const result = (await executeResponse.json()) as ClearResponse;
        if (!executeResponse.ok) {
          if (executeResponse.status === 409) {
            setError("确认令牌已过期、已使用，或数据数量已变化。请刷新页面后重新预览并确认。");
          } else {
            setError(result.error ?? "清理失败");
          }
          return;
        }

        setDone(`已清理 ${(result.deleted ?? 0).toLocaleString()} 条销售记录`);
        router.refresh();
      } catch {
        setError("无法完成清理请求，请检查网络后重试");
      }
    });
  }

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">数据清理</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            使用上方筛选器筛选后，预览匹配数据并安全清理。
          </p>
        </div>
        <button
          className="btn-danger flex items-center gap-2"
          disabled={pending || totalCount === 0}
          onClick={clear}
        >
          <Trash2 className="h-4 w-4" />
          {pending
            ? "核验并清理中…"
            : totalCount > 0
              ? `清理 ${totalCount.toLocaleString()} 条`
              : "无匹配数据"}
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
                {previewRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-slate-500">{row.orderDate.slice(0, 10)}</td>
                    <td className="px-3 py-1.5 font-medium">{row.brand}</td>
                    <td className="px-3 py-1.5 text-slate-500">{row.affiliatePlatform}</td>
                    <td className="px-3 py-1.5">{row.affiliateName}</td>
                    <td className="px-3 py-1.5 text-slate-400">{row.store ?? "—"}</td>
                    <td className="px-3 py-1.5 text-slate-400">{row.region ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">${row.revenue.toFixed(2)}</td>
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
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">{done}</p>}
    </section>
  );
}
