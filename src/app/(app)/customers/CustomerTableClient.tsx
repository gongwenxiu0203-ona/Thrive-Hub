"use client";

import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Settings2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ShareIntakeButton } from "@/components/ShareIntakeButton";
import {
  bulkDeleteCustomersWithRelations,
  bulkUpdateCustomers,
  getBulkCustomerDeleteImpact,
  type CustomerDeleteImpact,
} from "@/actions/customers";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_COLORS,
  RATING_LABELS,
  RATING_COLORS,
  PROMO_PLATFORMS,
  labelOf,
} from "@/lib/constants";

type UserOption = { id: string; name: string };

export type CustomerTableRow = {
  id: string;
  brandName: string;
  category: string | null;
  mainSites: string[];
  targetPlatforms: string[];
  affiliatePlatforms: string | null;
  status: string;
  rating: string;
  businessOwnerId: string | null;
  businessOwnerName: string | null;
  backendOwnerId: string | null;
  backendOwnerName: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  latestContractId: string | null;
  latestContractNo: string | null;
  latestContractStatus: string | null;
  latestContractLabel: string;
};

type SortKey =
  | "brandName"
  | "category"
  | "mainSites"
  | "targetPlatforms"
  | "affiliatePlatforms"
  | "latestContractLabel"
  | "status"
  | "rating"
  | "businessOwnerName"
  | "backendOwnerName"
  | "source"
  | "createdAt"
  | "updatedAt";
type SortState = { key: SortKey; direction: "asc" | "desc" };
type BulkField = "status" | "rating" | "targetPlatforms" | "businessOwnerId" | "backendOwnerId";
type BulkMode = "choose" | "update" | "delete";

const RATING_RANK: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, PENDING: 4 };
const STATUS_RANK = Object.keys(CUSTOMER_STATUS_LABELS).reduce<Record<string, number>>((acc, key, index) => {
  acc[key] = index;
  return acc;
}, {});

function cellValue(row: CustomerTableRow, key: SortKey): string | number {
  if (key === "mainSites") return row.mainSites.join(" / ");
  if (key === "targetPlatforms") return row.targetPlatforms.join(" / ");
  if (key === "rating") return RATING_RANK[row.rating] ?? 99;
  if (key === "status") return STATUS_RANK[row.status] ?? 99;
  if (key === "source") return row.source === "INTAKE" ? "客户门户" : "内部录入";
  return row[key] ?? "";
}

function compareRows(a: CustomerTableRow, b: CustomerTableRow, sort: SortState) {
  const av = cellValue(a, sort.key);
  const bv = cellValue(b, sort.key);
  const result =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "zh-Hans-CN", { numeric: true });
  return sort.direction === "asc" ? result : -result;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 text-left font-medium text-slate-600 hover:text-brand-700"
      >
        {label}
        {active ? (
          sort.direction === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <span className="text-slate-300">↕</span>
        )}
      </button>
    </th>
  );
}

export function CustomerTableClient({
  rows,
  users,
  isStaff,
  canDeleteCustomers,
  isChannel,
  staffUserId,
  channelUserId,
  filterControls,
}: {
  rows: CustomerTableRow[];
  users: UserOption[];
  isStaff: boolean;
  canDeleteCustomers: boolean;
  isChannel: boolean;
  staffUserId?: string;
  channelUserId?: string;
  filterControls?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({ key: "createdAt", direction: "desc" });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<BulkMode>("choose");
  const [bulkField, setBulkField] = useState<BulkField>("status");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkPlatforms, setBulkPlatforms] = useState<Set<string>>(new Set());
  const [deleteImpacts, setDeleteImpacts] = useState<CustomerDeleteImpact[] | null>(null);
  const [confirmedDeletes, setConfirmedDeletes] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => compareRows(a, b, sort));
    return next;
  }, [rows, sort]);

  const selectedIds = [...selected];
  const allChecked = sortedRows.length > 0 && sortedRows.every((r) => selected.has(r.id));

  function changeSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(sortedRows.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openBulkModal() {
    setBulkOpen(true);
    setBulkMode("choose");
    setMessage(null);
    setDeleteImpacts(null);
    setConfirmedDeletes(new Set());
  }

  function submitBulkUpdate() {
    setMessage(null);
    if (selectedIds.length === 0) {
      setMessage("请先选择客户");
      return;
    }
    const patch: Parameters<typeof bulkUpdateCustomers>[1] = {};
    if (bulkField === "targetPlatforms") {
      if (bulkPlatforms.size === 0) {
        setMessage("请选择目标推广平台");
        return;
      }
      patch.targetPlatforms = [...bulkPlatforms];
    } else if (bulkField === "status") {
      if (!bulkValue && (bulkField === "status" || bulkField === "rating")) {
        setMessage("请选择要修改成什么");
        return;
      }
      patch.status = bulkValue;
    } else if (bulkField === "rating") {
      if (!bulkValue) {
        setMessage("请选择要修改成什么");
        return;
      }
      patch.rating = bulkValue;
    } else if (bulkField === "businessOwnerId") {
      patch.businessOwnerId = bulkValue || null;
    } else if (bulkField === "backendOwnerId") {
      patch.backendOwnerId = bulkValue || null;
    }

    startTransition(async () => {
      const result = await bulkUpdateCustomers(selectedIds, patch);
      if (!result.ok) {
        setMessage(result.error ?? "批量修改失败");
        return;
      }
      setSelected(new Set());
      setBulkOpen(false);
      router.refresh();
    });
  }

  function loadDeleteImpacts() {
    setBulkMode("delete");
    setMessage(null);
    setDeleteImpacts(null);
    setConfirmedDeletes(new Set());
    startTransition(async () => {
      try {
        setDeleteImpacts(await getBulkCustomerDeleteImpact(selectedIds));
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "读取关联数据失败");
      }
    });
  }

  function confirmBulkDelete() {
    setMessage(null);
    const required =
      deleteImpacts?.flatMap((impact, impactIndex) =>
        impact.groups
          .filter((g) => g.count > 0)
          .map((g) => ({ key: `${impactIndex}:${g.key}`, label: `${impact.customerName} - ${g.label}` })),
      ) ?? [];
    const missing = required.filter((g) => !confirmedDeletes.has(g.key));
    if (missing.length > 0) {
      setMessage(`请逐项确认：${missing.map((g) => g.label).join("、")}`);
      return;
    }
    startTransition(async () => {
      const result = await bulkDeleteCustomersWithRelations(selectedIds);
      if (!result.ok) {
        setMessage(result.error ?? "批量删除失败");
        return;
      }
      setSelected(new Set());
      setBulkOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="filter-bar">
        {filterControls}
        {isStaff && (
          <button
            type="button"
            className="btn-secondary ml-auto"
            disabled={selectedIds.length === 0}
            onClick={openBulkModal}
          >
            <Settings2 className="h-4 w-4" />
            批量操作（{selectedIds.length}）
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="没有符合条件的客户" description="调整筛选条件，或新建 / 导入客户" />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {isStaff && (
                  <th className="w-10">
                    <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
                  </th>
                )}
                <SortHeader label="品牌/店铺名称" sortKey="brandName" sort={sort} onSort={changeSort} />
                <SortHeader label="品类" sortKey="category" sort={sort} onSort={changeSort} />
                <SortHeader label="主营站点" sortKey="mainSites" sort={sort} onSort={changeSort} />
                <SortHeader label="当前平台" sortKey="targetPlatforms" sort={sort} onSort={changeSort} />
                <SortHeader label="历史使用平台" sortKey="affiliatePlatforms" sort={sort} onSort={changeSort} />
                <SortHeader label="合同进度" sortKey="latestContractLabel" sort={sort} onSort={changeSort} />
                <SortHeader label="当前进度" sortKey="status" sort={sort} onSort={changeSort} />
                <SortHeader label="评级" sortKey="rating" sort={sort} onSort={changeSort} />
                <SortHeader label="商务负责人" sortKey="businessOwnerName" sort={sort} onSort={changeSort} />
                <SortHeader label="售前方案负责人" sortKey="backendOwnerName" sort={sort} onSort={changeSort} />
                <SortHeader label="来源" sortKey="source" sort={sort} onSort={changeSort} />
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((c) => (
                <tr key={c.id} className={selected.has(c.id) ? "bg-brand-50/70" : undefined}>
                  {isStaff && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={(e) => toggleOne(c.id, e.target.checked)}
                      />
                    </td>
                  )}
                  <td>
                    <Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.brandName}
                    </Link>
                  </td>
                  <td>{c.category ?? "-"}</td>
                  <td>
                    <span className="text-xs text-slate-500">{c.mainSites.join(" / ") || "-"}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {c.targetPlatforms.map((p) => (
                        <Badge key={p} className="bg-slate-100 text-slate-600">{p}</Badge>
                      ))}
                      {c.targetPlatforms.length === 0 && "-"}
                    </div>
                  </td>
                  <td>
                    <span className="text-xs text-slate-500">{c.affiliatePlatforms?.trim() || "-"}</span>
                  </td>
                  <td>
                    {c.latestContractId ? (
                      <Link href={`/contracts/${c.latestContractId}`} className="text-brand-700 hover:underline">
                        {c.latestContractLabel}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <Badge className={CUSTOMER_STATUS_COLORS[c.status]}>
                      {labelOf(CUSTOMER_STATUS_LABELS, c.status)}
                    </Badge>
                  </td>
                  <td>
                    <Badge className={RATING_COLORS[c.rating]}>
                      {labelOf(RATING_LABELS, c.rating)}
                    </Badge>
                  </td>
                  <td>{c.businessOwnerName ?? "-"}</td>
                  <td>{c.backendOwnerName ?? "-"}</td>
                  <td>
                    <span className="text-xs text-slate-500">{c.source === "INTAKE" ? "客户门户" : "内部录入"}</span>
                  </td>
                  <td>
                    <ShareIntakeButton
                      customerId={c.id}
                      brandName={c.brandName}
                      channelUserId={isChannel ? channelUserId : undefined}
                      staffUserId={isStaff ? staffUserId : undefined}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="批量操作">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">已选择 {selectedIds.length} 个客户。</p>

          {bulkMode === "choose" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" className="rounded-lg border border-slate-200 p-4 text-left hover:border-brand-300 hover:bg-brand-50" onClick={() => setBulkMode("update")}>
                <p className="font-semibold text-slate-800">批量修改</p>
                <p className="mt-1 text-xs text-slate-500">修改当前进度、评级、目标推广平台、负责人。</p>
              </button>
              {canDeleteCustomers && (
                <button type="button" className="rounded-lg border border-rose-200 p-4 text-left text-rose-700 hover:bg-rose-50" onClick={loadDeleteImpacts}>
                  <p className="font-semibold">批量删除</p>
                  <p className="mt-1 text-xs">进入关联数据逐项确认后删除。</p>
                </button>
              )}
            </div>
          )}

          {bulkMode === "update" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label text-xs">批量修改字段</label>
                  <select
                    className="input h-9 text-sm"
                    value={bulkField}
                    onChange={(e) => {
                      setBulkField(e.target.value as BulkField);
                      setBulkValue("");
                      setBulkPlatforms(new Set());
                      setMessage(null);
                    }}
                  >
                    <option value="status">当前进度</option>
                    <option value="rating">客户评级</option>
                    <option value="targetPlatforms">目标推广平台</option>
                    <option value="businessOwnerId">商务负责人</option>
                    <option value="backendOwnerId">售前方案负责人</option>
                  </select>
                </div>
                {bulkField !== "targetPlatforms" && (
                  <div>
                    <label className="label text-xs">修改成</label>
                    <select className="input h-9 text-sm" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                      {(bulkField === "businessOwnerId" || bulkField === "backendOwnerId") && <option value="">未分配</option>}
                      {bulkField === "status" &&
                        Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      {bulkField === "rating" &&
                        Object.entries(RATING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      {(bulkField === "businessOwnerId" || bulkField === "backendOwnerId") &&
                        users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {bulkField === "targetPlatforms" && (
                <div>
                  <label className="label text-xs">修改成</label>
                  <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    {PROMO_PLATFORMS.map((p) => (
                      <label key={p} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={bulkPlatforms.has(p)}
                          onChange={(e) => {
                            setBulkPlatforms((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(p);
                              else next.delete(p);
                              return next;
                            });
                          }}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {message && <p className="text-sm text-rose-600">{message}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setBulkMode("choose")}>返回</button>
                <button type="button" className="btn-primary" disabled={pending} onClick={submitBulkUpdate}>
                  {pending ? "修改中..." : "确认批量修改"}
                </button>
              </div>
            </div>
          )}

          {bulkMode === "delete" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                删除规则：客户和合同删除仅管理员可操作；删除客户时，关联合同、任务、项目、客户收入对账、推广数据批次、推广数据明细会一起软删除进入回收站，应收账款会解除客户关联但不直接删除；回收站内每条数据可单独恢复；联盟商资源库和推广数据 BI 的记录单独删除时，不反向删除客户和合同数据。
              </div>
              {!deleteImpacts ? (
                <p className="text-sm text-slate-500">正在读取关联数据...</p>
              ) : (
                <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
                  {deleteImpacts.map((impact, impactIndex) => (
                    <div key={`${impact.customerName}-${impactIndex}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-800">{impact.customerName}</p>
                      <div className="mt-2 space-y-2">
                        {impact.groups.map((g) => {
                          const key = `${impactIndex}:${g.key}`;
                          return (
                            <label key={key} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm">
                              <span>{g.label}<span className="ml-2 text-xs text-slate-400">{g.count} 条</span></span>
                              {g.count > 0 ? (
                                <input
                                  type="checkbox"
                                  checked={confirmedDeletes.has(key)}
                                  onChange={(e) => {
                                    setConfirmedDeletes((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(key);
                                      else next.delete(key);
                                      return next;
                                    });
                                  }}
                                />
                              ) : (
                                <span className="text-xs text-slate-400">无</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {message && <p className="text-sm text-rose-600">{message}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setBulkMode("choose")}>返回</button>
                <button type="button" className="btn-danger" disabled={pending || !deleteImpacts} onClick={confirmBulkDelete}>
                  <Trash2 className="h-4 w-4" />
                  {pending ? "删除中..." : "确认批量删除"}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
