"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, X, Search, Trash2, RotateCcw, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  RECONCILIATION_STATUS_LABELS,
  RECONCILIATION_STATUS_COLORS,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { NewReconciliationModal } from "./NewReconciliationModal";
import {
  NewChannelReconciliationModal,
  type ConfirmedCustomerRec,
} from "./NewChannelReconciliationModal";
import { ChannelReconciliationDetailModal, type ChannelReconciliationRecord, type CRPeriod } from "./ChannelReconciliationDetailModal";
import { ScopeToggle } from "@/components/ScopeToggle";
import { AffiliateReconciliationTab, type AffiliateRec } from "./AffiliateReconciliationTab";

type Settlement = {
  id: string;
  type: string;
  amount: number;
  status: string;
};

type Reconciliation = {
  id: string;
  status: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  feeAmount: number;
  commissionAmount: number;
  betType: string;
  betResult: string | null;
  customer: {
    id: string;
    brandName: string;
    businessOwner: { id: string; name: string } | null;
  };
  contract: { id: string; contractNo: string; type: string };
  createdBy: { id: string; name: string };
  settlements: Settlement[];
};

type TrashedReconciliation = {
  id: string;
  status: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  feeAmount: number;
  commissionAmount: number;
  deletedAt: Date | string | null;
  customer: { id: string; brandName: string };
  contract: { id: string; contractNo: string };
  createdBy: { id: string; name: string };
};

type ChannelReconciliation = ChannelReconciliationRecord & {
  status: string;
  totalShareAmount: number;
  fixedFeeShareTotal: number;
  commissionShareTotal: number;
  estimatedDate: Date | string | null;
  actualDate: Date | string | null;
  customerReconciliation: {
    id: string;
    periodStart: Date | string;
    periodEnd: Date | string;
    status: string;
  } | null;
  createdBy: { id: string; name: string };
};

type Customer = {
  id: string;
  brandName: string;
  businessOwnerId: string | null;
  contactPhone: string | null;
  contracts: {
    id: string;
    contractNo: string;
    type: string;
  }[];
};

type User = { id: string; name: string; email: string | null };

type Props = {
  reconciliations: Reconciliation[];
  trashedReconciliations: TrashedReconciliation[];
  channelReconciliations: ChannelReconciliation[];
  customers: Customer[];
  channelUsers: { id: string; name: string }[];
  allUsers: User[];
  currentUserId: string;
  confirmedCustomerReconciliations: ConfirmedCustomerRec[];
  affiliateReconciliations: AffiliateRec[];
  canToggleScope?: boolean;
  currentView?: "mine" | "all";
  isChannel?: boolean;
  canManageCustomerReconciliations?: boolean;
  canCreateChannelReconciliations?: boolean;
  canViewAffiliateReconciliations?: boolean;
};

type Tab = "customers" | "trash" | "channels" | "affiliates";

// ── aggregate settlement status ───────────────────────────────────────────────
function settlementAgg(settlements: Settlement[]): {
  label: string;
  color: string;
} {
  if (settlements.length === 0)
    return { label: "—", color: "bg-slate-100 text-slate-400" };
  const allSettled = settlements.every((s) => s.status === "SETTLED");
  const someSettled = settlements.some((s) => s.status === "SETTLED");
  if (allSettled) return { label: "已结算", color: "bg-emerald-100 text-emerald-700" };
  if (someSettled) return { label: "部分结算", color: "bg-amber-100 text-amber-700" };
  return { label: "待结算", color: "bg-slate-100 text-slate-600" };
}

// ── group reconciliations: one row per customer (latest rec) ──────────────────
type CustomerRow = {
  customerId: string;
  customerName: string;
  contractId: string;
  contractNo: string;
  latestRec: Reconciliation;
  ownerName: string;
};

function buildCustomerRows(recs: Reconciliation[]): CustomerRow[] {
  const map = new Map<string, CustomerRow>();
  for (const rec of recs) {
    const key = rec.customer.id;
    const existing = map.get(key);
    if (
      !existing ||
      new Date(rec.periodStart) > new Date(existing.latestRec.periodStart)
    ) {
      map.set(key, {
        customerId: rec.customer.id,
        customerName: rec.customer.brandName,
        contractId: rec.contract.id,
        contractNo: rec.contract.contractNo,
        latestRec: rec,
        ownerName: rec.customer.businessOwner?.name ?? rec.createdBy.name,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    new Date(b.latestRec.periodStart).getTime() -
    new Date(a.latestRec.periodStart).getTime()
  );
}

// ── MultiSelect filter with paste+search ─────────────────────────────────────
function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Handle paste: split by comma / newline / Chinese comma
  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const raw = e.clipboardData.getData("text");
    const parts = raw
      .split(/[\n,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const matches = options.filter((o) =>
      parts.some((p) => o.toLowerCase().includes(p.toLowerCase()))
    );
    if (matches.length > 0) {
      onChange([...new Set([...selected, ...matches])]);
    } else {
      setSearch(raw.trim());
    }
  }

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(v: string) {
    onChange(
      selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex h-9 min-w-[120px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:border-slate-300"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex-1 text-left">
          {selected.length === 0
            ? label
            : selected.length === 1
            ? selected[0]
            : `${label}(${selected.length})`}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {selected.length > 0 && (
        <button
          type="button"
          className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white"
          onClick={() => onChange([])}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-10 z-50 w-56 rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="搜索或粘贴"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPaste={onPaste}
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">无匹配结果</p>
            ) : (
              filtered.map((o) => (
                <label
                  key={o}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(o)}
                    onChange={() => toggle(o)}
                    className="h-3.5 w-3.5 accent-brand-600"
                  />
                  <span className="text-sm text-slate-700">{o}</span>
                </label>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 px-3 py-1.5">
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-600"
              onClick={() => setOpen(false)}
            >
              收起
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function FinanceClient({
  reconciliations,
  trashedReconciliations,
  channelReconciliations,
  customers,
  channelUsers,
  allUsers,
  currentUserId,
  confirmedCustomerReconciliations,
  affiliateReconciliations,
  canToggleScope = false,
  currentView = "mine",
  isChannel: _isChannel = false,
  canManageCustomerReconciliations = true,
  canCreateChannelReconciliations = true,
  canViewAffiliateReconciliations = true,
}: Props) {
  const [tab, setTab] = useState<Tab>("customers");
  const router = useRouter();

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "customers", label: "客户对账及结算" },
    { key: "channels", label: "渠道商对账及结算" },
    ...(canViewAffiliateReconciliations
      ? [{ key: "affiliates" as Tab, label: "联盟商对账及结算" }]
      : []),
    ...(canManageCustomerReconciliations
      ? [
          {
            key: "trash" as Tab,
            label: "已删除",
            count: trashedReconciliations.length,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">财务对账</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canToggleScope
              ? currentView === "all"
                ? "全部数据视图 · 管理客户、渠道商、联盟商的对账与结算"
                : "仅显示与你相关的对账 · 可切换到「全部」"
              : "管理客户、渠道商、联盟商的对账与结算"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canToggleScope && <ScopeToggle />}
          {tab === "customers" && canManageCustomerReconciliations && (
            <NewReconciliationModal
              customers={customers}
              users={allUsers}
              currentUserId={currentUserId}
              onCreated={() => router.refresh()}
            />
          )}
          {tab === "channels" && canCreateChannelReconciliations && (
            <NewChannelReconciliationModal
              confirmedRecs={confirmedCustomerReconciliations}
              channelUsers={channelUsers}
              onCreated={() => router.refresh()}
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 pb-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    tab === t.key
                      ? "bg-brand-100 text-brand-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {tab === "customers" && (
        <CustomerReconciliationTab
          reconciliations={reconciliations}
          canManage={canManageCustomerReconciliations}
        />
      )}
      {tab === "trash" && canManageCustomerReconciliations && (
        <TrashTab trashed={trashedReconciliations} />
      )}
      {tab === "channels" && (
        <ChannelReconciliationTab
          channelReconciliations={channelReconciliations}
          channelUsers={channelUsers}
        />
      )}
      {tab === "affiliates" && canViewAffiliateReconciliations && (
        <AffiliateReconciliationTab records={affiliateReconciliations} />
      )}
    </div>
  );
}

// ── 回收站 Tab ────────────────────────────────────────────────────────────────
function TrashTab({ trashed }: { trashed: TrashedReconciliation[] }) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function restore(id: string) {
    setRestoringId(id);
    try {
      const res = await fetch(
        `/api/finance/reconciliations/${id}/restore`,
        { method: "POST" },
      );
      if (!res.ok) {
        alert((await res.json()).error ?? "恢复失败");
        return;
      }
      router.refresh();
    } finally {
      setRestoringId(null);
    }
  }

  function daysRemaining(deletedAt: Date | string | null): number {
    if (!deletedAt) return 0;
    const d = new Date(deletedAt).getTime();
    const expireAt = d + 7 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((expireAt - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  if (trashed.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-4xl">🗑️</div>
        <p className="font-medium text-slate-700">回收站为空</p>
        <p className="mt-1 text-sm text-slate-400">
          删除的对账记录将在此显示，超过 7 天后自动永久删除
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        💡 已删除的对账保留 <strong>7 天</strong> 内可恢复，超期将自动永久删除（含关联结算与审核历史）
      </p>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                客户
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                合同编号
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                对账周期
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                状态
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                删除时间
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                剩余可恢复
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trashed.map((r) => {
              const remaining = daysRemaining(r.deletedAt);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {r.customer.brandName}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/contracts/${r.contract.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {r.contract.contractNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(r.periodStart)} ~ {formatDate(r.periodEnd)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={RECONCILIATION_STATUS_COLORS[r.status]}>
                      {RECONCILIATION_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.deletedAt ? formatDate(r.deletedAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium ${
                        remaining <= 1
                          ? "text-rose-600"
                          : remaining <= 3
                            ? "text-amber-600"
                            : "text-slate-500"
                      }`}
                    >
                      {remaining} 天
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-40"
                      disabled={restoringId === r.id || remaining === 0}
                      onClick={() => restore(r.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {restoringId === r.id ? "恢复中…" : "恢复"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CustomerReconciliationTab ─────────────────────────────────────────────────
function CustomerReconciliationTab({
  reconciliations,
  canManage = true,
}: {
  reconciliations: Reconciliation[];
  canManage?: boolean;
}) {
  const router = useRouter();
  // Filter state
  const allCustomerNames = [
    ...new Set(reconciliations.map((r) => r.customer.brandName)),
  ].sort();
  const settlementOptions = ["待结算", "部分结算", "已结算"];

  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [settlementFilter, setSettlementFilter] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    customerId: string;
    customerName: string;
    count: number;
  } | null>(null);

  const customerRows = buildCustomerRows(reconciliations);

  // 统计每个客户的对账记录总数
  const recCountByCustomer = new Map<string, number>();
  for (const r of reconciliations) {
    recCountByCustomer.set(
      r.customer.id,
      (recCountByCustomer.get(r.customer.id) ?? 0) + 1,
    );
  }

  async function deleteAllForCustomer(customerId: string) {
    setDeletingId(customerId);
    try {
      const res = await fetch(
        `/api/finance/customers/${customerId}/reconciliations`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        alert((await res.json()).error ?? "删除失败");
        return;
      }
      setConfirmTarget(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  // Apply filters
  const filtered = customerRows.filter((row) => {
    if (
      customerFilter.length > 0 &&
      !customerFilter.includes(row.customerName)
    )
      return false;
    if (settlementFilter.length > 0) {
      const agg = settlementAgg(row.latestRec.settlements);
      if (!settlementFilter.includes(agg.label) && agg.label !== "—")
        return false;
      if (agg.label === "—" && !settlementFilter.includes("待结算"))
        return false;
    }
    return true;
  });

  if (reconciliations.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-4xl">📋</div>
        <p className="font-medium text-slate-700">暂无对账记录</p>
        <p className="mt-1 text-sm text-slate-400">
          点击右上角「新建对账」开始创建
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">筛选：</span>
        <MultiSelectFilter
          label="客户"
          options={allCustomerNames}
          selected={customerFilter}
          onChange={setCustomerFilter}
        />
        <MultiSelectFilter
          label="结算状态"
          options={settlementOptions}
          selected={settlementFilter}
          onChange={setSettlementFilter}
        />
        {(customerFilter.length > 0 || settlementFilter.length > 0) && (
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-rose-500"
            onClick={() => {
              setCustomerFilter([]);
              setSettlementFilter([]);
            }}
          >
            清除筛选
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">
          共 {filtered.length} 个客户
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                客户
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                合同编号
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                最新对账周期
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                最新对账状态
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                结算状态
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                负责人
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                详情
              </th>
              {canManage && (
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  操作
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={canManage ? 8 : 7}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  没有匹配的记录
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const rec = row.latestRec;
                const agg = settlementAgg(rec.settlements);
                return (
                  <tr key={row.customerId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.customerName}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/contracts/${row.contractId}`}
                        className="text-brand-600 hover:underline"
                      >
                        {row.contractNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(rec.periodStart)} ~{" "}
                      {formatDate(rec.periodEnd)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          RECONCILIATION_STATUS_COLORS[rec.status]
                        }
                      >
                        {RECONCILIATION_STATUS_LABELS[rec.status] ??
                          rec.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={agg.color}>{agg.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.ownerName}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/finance/customers/${row.customerId}`}
                        className="text-brand-600 hover:underline"
                      >
                        详情
                      </Link>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                          title="删除该客户全部对账"
                          disabled={deletingId === row.customerId}
                          onClick={() =>
                            setConfirmTarget({
                              customerId: row.customerId,
                              customerName: row.customerName,
                              count:
                                recCountByCustomer.get(row.customerId) ?? 0,
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 删除确认 Modal */}
      {canManage && confirmTarget && (
        <Modal
          open
          onClose={() => {
            if (deletingId === null) setConfirmTarget(null);
          }}
          title="确认删除客户对账？"
        >
          <div className="space-y-3 text-sm text-slate-700">
              <p>
                即将删除客户 <strong>{confirmTarget.customerName}</strong>{" "}
                的全部 <strong>{confirmTarget.count}</strong>{" "}
                条月度对账记录。
              </p>
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                💡 删除后会进入「已删除」Tab，<strong>7 天内可恢复</strong>，超期将自动永久清理。
              </p>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmTarget(null)}
                disabled={deletingId !== null}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                disabled={deletingId !== null}
                onClick={() => deleteAllForCustomer(confirmTarget.customerId)}
              >
                {deletingId === confirmTarget.customerId
                  ? "删除中…"
                  : "确认删除"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── ChannelReconciliationTab ──────────────────────────────────────────────────

// 分账结算状态聚合
function channelShareStatusAgg(cr: ChannelReconciliation): { label: string; color: string } {
  if (cr.autoCreated) {
    const total = cr.periods.length;
    if (total === 0) return { label: "待配置", color: "bg-slate-100 text-slate-500" };
    const hasFixed = cr.fixedFeeTotal != null && cr.fixedFeeTotal > 0;
    const hasComm  = cr.commissionTotal != null && cr.commissionTotal > 0;
    const paidFixed = cr.periods.filter((p: CRPeriod) => p.fixedFeePaidAt).length;
    const paidComm  = cr.periods.filter((p: CRPeriod) => p.commissionPaidAt).length;
    const allFixed = !hasFixed || paidFixed === total;
    const allComm  = !hasComm  || paidComm  === total;
    if (allFixed && allComm) return { label: "已完成", color: "bg-emerald-100 text-emerald-700" };
    if (paidFixed > 0 || paidComm > 0) return { label: "进行中", color: "bg-amber-100 text-amber-700" };
    return { label: "待分账", color: "bg-rose-100 text-rose-700" };
  }
  const fxDone = !!cr.fixedFeeActualDate;
  const cmDone = !!cr.commissionActualDate;
  const fxHas = cr.fixedFeeReceived != null && cr.fixedFeeShareAmount > 0;
  const cmHas = cr.commissionReceived != null && cr.commissionShareAmount > 0;
  if (!fxHas && !cmHas) return { label: "待结算", color: "bg-slate-100 text-slate-500" };
  const fxOk = !fxHas || fxDone;
  const cmOk = !cmHas || cmDone;
  if (fxOk && cmOk) return { label: "已分账", color: "bg-emerald-100 text-emerald-700" };
  if (fxDone || cmDone) return { label: "部分分账", color: "bg-amber-100 text-amber-700" };
  return { label: "待分账", color: "bg-rose-100 text-rose-700" };
}

function ChannelReconciliationTab({
  channelReconciliations,
  channelUsers,
}: {
  channelReconciliations: ChannelReconciliation[];
  channelUsers: { id: string; name: string }[];
}) {
  void channelUsers;
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // 筛选选项
  const allCustomerNames = [
    ...new Set(channelReconciliations.map((c) => c.customer.brandName)),
  ].sort();
  const allChannelNames = [
    ...new Set(channelReconciliations.map((c) => c.channelUser.name)),
  ].sort();
  const statusOptions = ["待结算", "待分账", "部分分账", "已分账"];

  // 应用筛选
  const filtered = channelReconciliations.filter((cr) => {
    if (
      customerFilter.length > 0 &&
      !customerFilter.includes(cr.customer.brandName)
    )
      return false;
    if (
      channelFilter.length > 0 &&
      !channelFilter.includes(cr.channelUser.name)
    )
      return false;
    if (statusFilter.length > 0) {
      const agg = channelShareStatusAgg(cr);
      if (!statusFilter.includes(agg.label)) return false;
    }
    return true;
  });

  if (channelReconciliations.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-4xl">🏪</div>
        <p className="font-medium text-slate-700">暂无渠道商分账记录</p>
        <p className="mt-1 text-sm text-slate-400">
          点击右上角「+ 新建渠道分账」开始创建
        </p>
      </div>
    );
  }

  function sym(c: string) {
    return c === "美金" ? "$" : "¥";
  }

  function shareDisplay(
    received: number | null,
    amount: number,
    rate: number,
    currency: string,
    actualDate: Date | string | null,
  ): React.ReactNode {
    if (received == null) {
      return <span className="text-slate-400">—（待结算）</span>;
    }
    const s = sym(currency);
    const status = actualDate ? (
      <Badge className="bg-emerald-100 text-emerald-700 ml-1">已分账</Badge>
    ) : (
      <Badge className="bg-amber-100 text-amber-700 ml-1">待分账</Badge>
    );
    return (
      <span>
        <span className="text-xs text-slate-400">
          {s}
          {received.toLocaleString()} × {(rate * 100).toFixed(1)}% =
        </span>{" "}
        <strong className="text-slate-800">
          {s}
          {amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
        </strong>
        {status}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">筛选：</span>
        <MultiSelectFilter
          label="客户"
          options={allCustomerNames}
          selected={customerFilter}
          onChange={setCustomerFilter}
        />
        <MultiSelectFilter
          label="渠道商"
          options={allChannelNames}
          selected={channelFilter}
          onChange={setChannelFilter}
        />
        <MultiSelectFilter
          label="分账结算状态"
          options={statusOptions}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
        {(customerFilter.length > 0 ||
          channelFilter.length > 0 ||
          statusFilter.length > 0) && (
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-rose-500"
            onClick={() => {
              setCustomerFilter([]);
              setChannelFilter([]);
              setStatusFilter([]);
            }}
          >
            清除筛选
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">
          共 {filtered.length} / {channelReconciliations.length} 条
        </span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">客户</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">合同</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">渠道商</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">固费分账</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">佣金分账</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">期数进度</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  没有匹配的记录
                </td>
              </tr>
            ) : (
              filtered.map((cr) => {
                const agg = channelShareStatusAgg(cr);
                const paidFixed = cr.periods.filter((p: CRPeriod) => p.fixedFeePaidAt).length;
                const paidComm  = cr.periods.filter((p: CRPeriod) => p.commissionPaidAt).length;
                return (
                  <tr key={cr.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {cr.customer.brandName}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {cr.contract ? (
                        <Link href={`/contracts/${cr.contract.id}`} className="text-brand-600 hover:underline">
                          {cr.contract.contractNo}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{cr.channelUser.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {cr.autoCreated ? (
                        cr.fixedFeeTotal != null ? (
                          <span>¥{cr.fixedFeeTotal.toLocaleString()}</span>
                        ) : <span className="text-slate-400">待设置</span>
                      ) : shareDisplay(cr.fixedFeeReceived, cr.fixedFeeShareAmount, cr.fixedFeeShareRate, cr.fixedFeeShareCurrency, cr.fixedFeeActualDate)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {cr.autoCreated ? (
                        cr.commissionTotal != null ? (
                          <span>¥{cr.commissionTotal.toLocaleString()}</span>
                        ) : <span className="text-slate-400">待设置</span>
                      ) : shareDisplay(cr.commissionReceived, cr.commissionShareAmount, cr.commissionShareRate, cr.commissionShareCurrency, cr.commissionActualDate)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {cr.autoCreated ? (
                        cr.periods.length > 0 ? (
                          <div>
                            <div>{cr.periodType === "quarterly" ? "季度" : "月度"} · 共{cr.totalPeriods}期</div>
                            {cr.fixedFeeTotal != null && <div className="text-slate-400">固费 {paidFixed}/{cr.totalPeriods}</div>}
                            {cr.commissionTotal != null && <div className="text-slate-400">佣金 {paidComm}/{cr.totalPeriods}</div>}
                          </div>
                        ) : <span className="text-slate-400">未配置</span>
                      ) : (
                        <span>第{cr.periodNo}期{cr.periodStart && cr.periodEnd && <div className="text-slate-400">{formatDate(cr.periodStart)}~{formatDate(cr.periodEnd)}</div>}</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><Badge className={agg.color}>{agg.label}</Badge></td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/finance/channel-reconciliations/${cr.id}`}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-600 hover:bg-brand-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {cr.autoCreated ? "管理" : "编辑"}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
