"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkDeleteSalesRecords,
  bulkDeleteSalesRecordsByFilter,
  bulkUpdateSalesRecordsCustomer,
  bulkUpdateSalesRecordsCustomerByFilter,
  getSalesBulkOperationLogs,
  undoSalesBulkOperationLogs,
  undoBulkDeleteSalesRecords,
  undoBulkUpdateSalesRecordsCustomer,
  type SalesBulkOperationLogRow,
  type SalesRecordUndoSnapshot,
} from "@/actions/sales";
import { formatCurrency } from "@/lib/utils";
import type { SalesRecordFilterParams } from "@/lib/salesRecordFilters";
import { Modal } from "@/components/ui/Modal";

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
type UndoState =
  | { type: "customer"; snapshots: SalesRecordUndoSnapshot[]; label: string }
  | { type: "delete"; ids: string[]; label: string };

export function SalesDetailTable({
  records,
  customers,
  total,
  filterParams,
}: {
  records: SalesDetailRecord[];
  customers: CustomerOption[];
  total: number;
  filterParams: SalesRecordFilterParams;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState<SalesBulkOperationLogRow[]>([]);
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedLogIdList = useMemo(() => [...selectedLogIds], [selectedLogIds]);
  const selectedCount = allMatchingSelected ? total : selectedIds.length;
  const allChecked = records.length > 0 && (allMatchingSelected || records.every((r) => selected.has(r.id)));

  function toggleAll(checked: boolean) {
    setAllMatchingSelected(false);
    setSelected(checked ? new Set(records.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    if (allMatchingSelected) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    setMessage(null);
    if (!customerId) {
      setMessage("请选择要关联的客户");
      return;
    }
    if (selectedCount === 0) {
      setMessage("请先选择数据记录");
      return;
    }
    startTransition(async () => {
      try {
        const result = allMatchingSelected
          ? await bulkUpdateSalesRecordsCustomerByFilter(filterParams, customerId)
          : await bulkUpdateSalesRecordsCustomer(selectedIds, customerId);
        if (result.undoCustomerSnapshots?.length) {
          setUndoState({
            type: "customer",
            snapshots: result.undoCustomerSnapshots,
            label: `撤回上一步：恢复 ${result.count} 条关联客户`,
          });
        }
        setSelected(new Set());
        setAllMatchingSelected(false);
        setMessage(`已修改 ${result.count} 条数据的关联客户`);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "批量修改失败");
      }
    });
  }

  function removeSelected() {
    setMessage(null);
    if (selectedCount === 0) {
      setMessage("请先选择数据记录");
      return;
    }
    const label = allMatchingSelected ? `当前筛选下全部 ${total} 条` : `选中的 ${selectedIds.length} 条`;
    if (!confirm(`确认删除${label}推广数据明细？删除后可在回收站单独恢复，也可先用“撤回上一步”恢复本次删除。`)) return;
    startTransition(async () => {
      try {
        const result = allMatchingSelected
          ? await bulkDeleteSalesRecordsByFilter(filterParams)
          : await bulkDeleteSalesRecords(selectedIds);
        if (result.undoDeleteIds?.length) {
          setUndoState({
            type: "delete",
            ids: result.undoDeleteIds,
            label: `撤回上一步：恢复 ${result.count} 条删除`,
          });
        }
        setSelected(new Set());
        setAllMatchingSelected(false);
        setMessage(`已删除 ${result.count} 条数据`);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "删除失败");
      }
    });
  }

  function selectCurrentPage() {
    setAllMatchingSelected(false);
    setSelected(new Set(records.map((r) => r.id)));
    setMessage(`已选择当前页 ${records.length} 条`);
  }

  function selectAllMatching() {
    setSelected(new Set());
    setAllMatchingSelected(true);
    setMessage(`已选择当前筛选下全部 ${total} 条`);
  }

  function clearSelection() {
    setSelected(new Set());
    setAllMatchingSelected(false);
    setMessage(null);
  }

  function undoLast() {
    if (!undoState) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result =
          undoState.type === "customer"
            ? await undoBulkUpdateSalesRecordsCustomer(undoState.snapshots)
            : await undoBulkDeleteSalesRecords(undoState.ids);
        setUndoState(null);
        setMessage(`已撤回上一步，恢复 ${result.count} 条数据`);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "撤回失败");
      }
    });
  }

  function openLogs() {
    setLogOpen(true);
    setMessage(null);
    startTransition(async () => {
      try {
        const rows = await getSalesBulkOperationLogs();
        setLogs(rows);
        setSelectedLogIds(new Set());
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "读取批量操作日志失败");
      }
    });
  }

  function toggleLog(id: string, checked: boolean) {
    setSelectedLogIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllReversibleLogs(checked: boolean) {
    setSelectedLogIds(checked ? new Set(logs.filter((log) => !log.revertedAt).map((log) => log.id)) : new Set());
  }

  function undoSelectedLogs() {
    setMessage(null);
    if (selectedLogIdList.length === 0) return;
    if (!confirm(`确认撤销选中的 ${selectedLogIdList.length} 条批量操作？系统会按日志快照恢复相关数据。`)) return;
    startTransition(async () => {
      try {
        const result = await undoSalesBulkOperationLogs(selectedLogIdList);
        const rows = await getSalesBulkOperationLogs();
        setLogs(rows);
        setSelectedLogIds(new Set());
        setUndoState(null);
        setMessage(`已撤销 ${selectedLogIdList.length} 条日志，恢复 ${result.count} 条数据`);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "撤销日志失败");
      }
    });
  }

  function formatLogTime(value: string | null) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3">
        <div>
          <label className="label text-xs">批量关联客户</label>
          <select className="input h-9 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">请选择客户</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.brandName}</option>
            ))}
          </select>
        </div>
        <div className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600">
          <button type="button" className="text-brand-600 hover:underline" disabled={records.length === 0 || pending} onClick={selectCurrentPage}>
            全选本页
          </button>
          <span className="text-slate-300">/</span>
          <button type="button" className="text-brand-600 hover:underline" disabled={total === 0 || pending} onClick={selectAllMatching}>
            全选全部页
          </button>
          <span className="text-slate-300">/</span>
          <button type="button" className="text-slate-500 hover:underline" disabled={selectedCount === 0 || pending} onClick={clearSelection}>
            清空
          </button>
        </div>
        <button className="btn-primary h-9" disabled={pending || selectedCount === 0 || !customerId} onClick={submit}>
          批量修改（{selectedCount}）
        </button>
        <button className="btn-danger h-9" disabled={pending || selectedCount === 0} onClick={removeSelected}>
          删除选中
        </button>
        <button className="btn-secondary h-9" disabled={pending || !undoState} onClick={undoLast}>
          撤回上一步
        </button>
        <button className="btn-secondary h-9" disabled={pending} onClick={openLogs}>
          批量操作日志
        </button>
        <div className="min-w-0 text-xs text-slate-500">
          <p>
            {allMatchingSelected ? `已选择当前筛选全部 ${total} 条` : `已选择 ${selectedIds.length} 条`}
          </p>
          {undoState && <p className="text-amber-600">{undoState.label}</p>}
          {message && <p>{message}</p>}
        </div>
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
                      checked={allMatchingSelected || selected.has(r.id)}
                      disabled={allMatchingSelected}
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
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="批量操作日志">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              显示最近 80 条推广数据 BI 明细批量操作。已撤销的记录不可再次选择。
            </p>
            <button className="btn-primary btn-sm" disabled={pending || selectedLogIdList.length === 0} onClick={undoSelectedLogs}>
              撤销选中（{selectedLogIdList.length}）
            </button>
          </div>
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
            <table className="data w-full text-xs">
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={logs.some((log) => !log.revertedAt) && logs.filter((log) => !log.revertedAt).every((log) => selectedLogIds.has(log.id))}
                      onChange={(e) => toggleAllReversibleLogs(e.target.checked)}
                    />
                  </th>
                  <th>操作类型</th>
                  <th>操作内容</th>
                  <th>条数</th>
                  <th>操作人</th>
                  <th>操作时间</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      暂无批量操作日志
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const disabled = !!log.revertedAt;
                    return (
                      <tr key={log.id}>
                        <td>
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={selectedLogIds.has(log.id)}
                            onChange={(e) => toggleLog(log.id, e.target.checked)}
                          />
                        </td>
                        <td>{log.actionType}</td>
                        <td className="max-w-[22rem] whitespace-normal">{log.summary}</td>
                        <td>{log.recordCount}</td>
                        <td>{log.operatorName}</td>
                        <td>{formatLogTime(log.createdAt)}</td>
                        <td>
                          {log.revertedAt ? (
                            <span className="badge bg-slate-100 text-slate-500">已撤销 · {formatLogTime(log.revertedAt)}</span>
                          ) : (
                            <span className="badge bg-emerald-50 text-emerald-700">可撤销</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
