"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkDeleteSalesRecords, bulkUpdateSalesRecordsCustomer } from "@/actions/sales";
import { formatCurrency } from "@/lib/utils";

export type SalesDetailRecord = {
  id: string;
  orderDate: string;
  affiliatePlatform: string;
  affiliateProgram: string | null;
  store: string | null;
  brand: string;
  affiliateName: string;
  affiliateTypeLabel: string;
  region: string | null;
  asin: string | null;
  parentAsin: string | null;
  storeProductLabel: string | null;
  revenue: number;
  unitsSold: number;
  commission: number;
  commissionRate: number;
  customerId: string | null;
};

type CustomerOption = { id: string; brandName: string };

export function SalesDetailTable({
  records,
  customers,
}: {
  records: SalesDetailRecord[];
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customerId, setCustomerId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const selectedIds = useMemo(() => [...selected], [selected]);
  const allChecked = records.length > 0 && records.every((r) => selected.has(r.id));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(records.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    setMessage(null);
    if (selectedIds.length === 0) {
      setMessage("请先选择数据记录");
      return;
    }
    startTransition(async () => {
      try {
        await bulkUpdateSalesRecordsCustomer(selectedIds, customerId || null);
        setSelected(new Set());
        setMessage(`已修改 ${selectedIds.length} 条数据的关联客户`);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "批量修改失败");
      }
    });
  }

  function removeSelected() {
    setMessage(null);
    if (selectedIds.length === 0) {
      setMessage("请先选择数据记录");
      return;
    }
    if (!confirm(`确认删除选中的 ${selectedIds.length} 条推广数据明细？删除后可在回收站单独恢复。`)) return;
    startTransition(async () => {
      try {
        await bulkDeleteSalesRecords(selectedIds);
        setSelected(new Set());
        setMessage(`已删除 ${selectedIds.length} 条数据`);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "删除失败");
      }
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3">
        <div>
          <label className="label text-xs">批量关联客户</label>
          <select className="input h-9 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">解除关联</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.brandName}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary h-9" disabled={pending || selectedIds.length === 0} onClick={submit}>
          批量修改（{selectedIds.length}）
        </button>
        <button className="btn-danger h-9" disabled={pending || selectedIds.length === 0} onClick={removeSelected}>
          删除选中
        </button>
        {message && <p className="text-xs text-slate-500">{message}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="data w-full text-xs">
          <thead>
            <tr>
              <th className="w-10">
                <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
              </th>
              <th>订单日期</th>
              <th>联盟平台</th>
              <th>联盟类型</th>
              <th>店铺</th>
              <th>品牌</th>
              <th>联盟商</th>
              <th>类型</th>
              <th>地区</th>
              <th>ASIN</th>
              <th>Parent</th>
              <th>链接标签</th>
              <th className="text-right">销售金额</th>
              <th className="text-right">销售数量</th>
              <th className="text-right">佣金</th>
              <th className="text-right">佣金率</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={16} className="py-8 text-center text-slate-400">
                  无符合条件的数据
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={(e) => toggleOne(r.id, e.target.checked)}
                    />
                  </td>
                  <td>{r.orderDate}</td>
                  <td>{r.affiliatePlatform}</td>
                  <td>{r.affiliateProgram ?? "-"}</td>
                  <td>{r.store ?? "-"}</td>
                  <td>{r.brand}</td>
                  <td>{r.affiliateName}</td>
                  <td>{r.affiliateTypeLabel || "-"}</td>
                  <td>{r.region ?? "-"}</td>
                  <td>{r.asin ?? "-"}</td>
                  <td>{r.parentAsin ?? "-"}</td>
                  <td>{r.storeProductLabel ?? "-"}</td>
                  <td className="text-right">{formatCurrency(r.revenue)}</td>
                  <td className="text-right">{r.unitsSold}</td>
                  <td className="text-right">{formatCurrency(r.commission)}</td>
                  <td className="text-right">{(r.commissionRate * 100).toFixed(2)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
