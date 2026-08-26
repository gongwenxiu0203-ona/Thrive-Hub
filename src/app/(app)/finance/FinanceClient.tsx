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
  type ChannelReconciliationCustomerOption,
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
  reconcileType: string;
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

type CancelledReconciliation = {
  id: string;
  reconcileType: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  adjustmentReason: string | null;
  customer: { id: string; brandName: string; cooperationEndDate: Date | string | null };
  contract: { id: string; contractNo: string };
  createdBy: { id: string; name: string };
};

type ChannelReconciliation = Omit<ChannelReconciliationRecord, "periods"> & {
  recordMode: string;
  fixedFeeReceivedCurrency: string;
  commissionReceivedCurrency: string;
  periods: Array<CRPeriod & {
    streamType: string;
    fixedFeeShareAmount: number | null;
    commissionShareAmount: number | null;
    fixedFeeReceivedCurrency: string | null;
    commissionReceivedCurrency: string | null;
  }>;
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
  contracts: {
    id: string;
    contractNo: string;
    type: string;
    startDate: Date | string | null;
    endDate: Date | string | null;
    feeCurrency: string | null;
    thresholdCurrency: string | null;
    betTargetCurrency: string | null;
    tieredRules: string | null;
  }[];
};

type Props = {
  reconciliations: Reconciliation[];
  cancelledReconciliations: CancelledReconciliation[];
  trashedReconciliations: TrashedReconciliation[];
  channelReconciliations: ChannelReconciliation[];
  customers: Customer[];
  channelUsers: { id: string; name: string }[];
  channelReconciliationCustomers: ChannelReconciliationCustomerOption[];
  affiliateReconciliations: AffiliateRec[];
  canToggleScope?: boolean;
  currentView?: "mine" | "all";
  isChannel?: boolean;
  canViewCustomerReconciliations?: boolean;
  canEditCustomerReconciliations?: boolean;
  canManageCustomerReconciliations?: boolean;
  canViewChannelReconciliations?: boolean;
  canEditChannelReconciliations?: boolean;
  canManageChannelReconciliations?: boolean;
  canCreateChannelReconciliations?: boolean;
  canViewAffiliateReconciliations?: boolean;
  canEditAffiliateReconciliations?: boolean;
  canManageAffiliateReconciliations?: boolean;
};

type Tab = "customers" | "cancelled" | "trash" | "channels" | "affiliates";

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
  latestFixedRec: Reconciliation | null;
  latestCommissionRec: Reconciliation | null;
  ownerName: string;
};

function buildCustomerRows(recs: Reconciliation[]): CustomerRow[] {
  const grouped = new Map<string, Reconciliation[]>();
  for (const rec of recs) {
    grouped.set(rec.customer.id, [...(grouped.get(rec.customer.id) ?? []), rec]);
  }
  const rows = Array.from(grouped.values()).map((customerRecs) => {
    const sorted = [...customerRecs].sort(
      (a, b) =>
        new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime(),
    );
    const latestRec = sorted[0];
    return {
      customerId: latestRec.customer.id,
      customerName: latestRec.customer.brandName,
      contractId: latestRec.contract.id,
      contractNo: latestRec.contract.contractNo,
      latestRec,
      latestFixedRec:
        sorted.find((rec) => rec.reconcileType !== "COMMISSION_ONLY") ?? null,
      latestCommissionRec:
        sorted.find((rec) => rec.reconcileType !== "FEE_ONLY") ?? null,
      ownerName:
        latestRec.customer.businessOwner?.name ?? latestRec.createdBy.name,
    };
  });
  return rows.sort(
    (a, b) =>
      new Date(b.latestRec.periodStart).getTime() -
      new Date(a.latestRec.periodStart).getTime(),
  );
}

function streamSettlementAgg(
  rec: Reconciliation | null,
  type: "FIXED_FEE" | "COMMISSION",
) {
  if (!rec) return settlementAgg([]);
  return settlementAgg(
    rec.settlements.filter((settlement) => settlement.type === type),
  );
}
function CustomerStreamSummary({
  rec,
  settlementType,
}: {
  rec: Reconciliation | null;
  settlementType: "FIXED_FEE" | "COMMISSION";
}) {
  if (!rec) return <span className="text-sm text-slate-400">暂无记录</span>;
  const settlement = streamSettlementAgg(rec, settlementType);
  return (
    <div className="min-w-[190px] space-y-1.5">
      <div className="text-sm text-slate-700">
        {formatDate(rec.periodStart)} ~ {formatDate(rec.periodEnd)}
      </div>
      <Link href={`/contracts/${rec.contract.id}`} className="text-xs text-brand-600 hover:underline">
        合同 {rec.contract.contractNo}
      </Link>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={RECONCILIATION_STATUS_COLORS[rec.status]}>
          {RECONCILIATION_STATUS_LABELS[rec.status] ?? rec.status}
        </Badge>
        <Badge className={settlement.color}>{settlement.label}</Badge>
        {rec.reconcileType === "BOTH" && (
          <Badge className="bg-indigo-50 text-indigo-600">历史合并</Badge>
        )}
      </div>
    </div>
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
  cancelledReconciliations,
  trashedReconciliations,
  channelReconciliations,
  customers,
  channelUsers,
  channelReconciliationCustomers,
  affiliateReconciliations,
  canToggleScope = false,
  currentView = "mine",
  isChannel: _isChannel = false,
  canViewCustomerReconciliations = true,
  canEditCustomerReconciliations = true,
  canManageCustomerReconciliations = true,
  canViewChannelReconciliations = true,
  canEditChannelReconciliations = true,
  canManageChannelReconciliations = true,
  canCreateChannelReconciliations = true,
  canViewAffiliateReconciliations = true,
  canEditAffiliateReconciliations = true,
  canManageAffiliateReconciliations = true,
}: Props) {
  const router = useRouter();

  const allTabs: { key: Tab; label: string; count?: number }[] = [
    { key: "customers", label: "客户对账" },
    { key: "channels", label: "渠道分账" },
    ...(canViewAffiliateReconciliations
      ? [{ key: "affiliates" as Tab, label: "联盟商结算" }]
      : []),
    ...(canManageCustomerReconciliations
      ? [
          {
            key: "cancelled" as Tab,
            label: "作废记录",
            count: cancelledReconciliations.length,
          },
          {
            key: "trash" as Tab,
            label: "已删除",
            count: trashedReconciliations.length,
          },
        ]
      : []),
  ];
  const tabs = allTabs.filter((item) => {
    if (item.key === "customers") return canViewCustomerReconciliations;
    if (item.key === "channels") return canViewChannelReconciliations;
    if (item.key === "affiliates") return canViewAffiliateReconciliations;
    return canManageCustomerReconciliations;
  });
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? "customers");
  const canToggleCurrentTab =
    canToggleScope &&
    (tab === "channels"
      ? canManageChannelReconciliations
      : tab === "affiliates"
        ? canManageAffiliateReconciliations
        : canManageCustomerReconciliations);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">结算中心</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canToggleCurrentTab
              ? currentView === "all"
                ? "全部数据视图 · 统一管理客户对账、渠道分账与联盟商结算"
                : "仅显示与你相关的结算记录 · 可切换到「全部」"
              : "统一管理客户对账、渠道分账与联盟商结算"}
          </p>
          <p className="mt-1 text-xs text-brand-700">
            创建要求：合同已签署完成，且客户状态为“合作中”。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canToggleCurrentTab && <ScopeToggle />}
          {tab === "customers" && canEditCustomerReconciliations && (
            <NewReconciliationModal
              customers={customers}
              onCreated={() => router.refresh()}
            />
          )}
          {tab === "channels" && canEditChannelReconciliations && canCreateChannelReconciliations && (
            <NewChannelReconciliationModal
              customers={channelReconciliationCustomers}
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

      {tab === "customers" && canViewCustomerReconciliations && (
        <CustomerReconciliationTab
          reconciliations={reconciliations}
          canManage={canManageCustomerReconciliations}
        />
      )}
      {tab === "cancelled" && canManageCustomerReconciliations && (
        <CancelledReconciliationTab records={cancelledReconciliations} onDone={() => router.refresh()} />
      )}
      {tab === "trash" && canManageCustomerReconciliations && (
        <TrashTab trashed={trashedReconciliations} />
      )}
      {tab === "channels" && canViewChannelReconciliations && (
        <ChannelReconciliationTab
          channelReconciliations={channelReconciliations}
          channelUsers={channelUsers}
        />
      )}
      {tab === "affiliates" && canViewAffiliateReconciliations && (
        <AffiliateReconciliationTab
          records={affiliateReconciliations}
          canEdit={canEditAffiliateReconciliations}
        />
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
      const statuses = [
        streamSettlementAgg(row.latestFixedRec, "FIXED_FEE").label,
        streamSettlementAgg(row.latestCommissionRec, "COMMISSION").label,
      ].map((label) => (label === "—" ? "待结算" : label));
      if (!statuses.some((label) => settlementFilter.includes(label)))
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
                固费对账（最新）
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                销售佣金对账（最新）
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
                  colSpan={canManage ? 6 : 5}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  没有匹配的记录
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const fixedRec = row.latestFixedRec;
                const commissionRec = row.latestCommissionRec;
                return (
                  <tr key={row.customerId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.customerName}
                    </td>
                    <td className="px-4 py-3">
                      <CustomerStreamSummary
                        rec={fixedRec}
                        settlementType="FIXED_FEE"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <CustomerStreamSummary
                        rec={commissionRec}
                        settlementType="COMMISSION"
                      />
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

function CancelledReconciliationTab({
  records,
  onDone,
}: {
  records: CancelledReconciliation[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [restoring, setRestoring] = useState(false);
  const allSelected = records.length > 0 && selected.length === records.length;

  async function restore(ids: string[]) {
    const reason = window.prompt("请填写恢复作废对账的原因");
    if (!reason?.trim()) return;
    setRestoring(true);
    try {
      const response = await fetch("/api/finance/reconciliations/plan-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reason: reason.trim() }),
      });
      if (!response.ok) {
        alert((await response.json()).error ?? "恢复失败");
        return;
      }
      setSelected([]);
      onDone();
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="font-semibold text-slate-900">作废的客户对账记录</h2>
          <p className="mt-1 text-xs text-slate-500">管理员可单条或批量恢复；恢复操作必须填写原因并保留审计记录。</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={!selected.length || restoring}
          onClick={() => void restore(selected)}
        >
          批量恢复（{selected.length}）
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : records.map((item) => item.id))} /></th>
              <th className="px-4 py-3">客户</th>
              <th className="px-4 py-3">合同</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">周期</th>
              <th className="px-4 py-3">合作结束日期</th>
              <th className="px-4 py-3">作废原因</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((record) => (
              <tr key={record.id}>
                <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(record.id)} onChange={() => setSelected((current) => current.includes(record.id) ? current.filter((id) => id !== record.id) : [...current, record.id])} /></td>
                <td className="px-4 py-3 font-medium text-slate-900">{record.customer.brandName}</td>
                <td className="px-4 py-3">{record.contract.contractNo}</td>
                <td className="px-4 py-3">{record.reconcileType === "FEE_ONLY" ? "固费" : "销售佣金"}</td>
                <td className="px-4 py-3">{formatDate(record.periodStart)} ~ {formatDate(record.periodEnd)}</td>
                <td className="px-4 py-3">{record.customer.cooperationEndDate ? formatDate(record.customer.cooperationEndDate) : "—"}</td>
                <td className="max-w-72 px-4 py-3 text-xs text-slate-500">{record.adjustmentReason ?? "—"}</td>
                <td className="px-4 py-3"><button type="button" className="text-brand-700 hover:underline" disabled={restoring} onClick={() => void restore([record.id])}>恢复正常对账</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length && <p className="py-12 text-center text-sm text-slate-500">暂无作废记录</p>}
      </div>
    </div>
  );
}

// ── ChannelReconciliationTab ──────────────────────────────────────────────────

// 分账结算状态聚合
function channelShareStatusAgg(cr: ChannelReconciliation): { label: string; color: string } {
  if (cr.recordMode === "RULE_DRIVEN") {
    const fixed = cr.periods
      .filter((period) => period.streamType !== "COMMISSION")
      .map((period) => ({
        recorded: period.fixedFeeShareAmount !== null,
        paid: Boolean(period.fixedFeePaidAt),
      }));
    const commission = cr.periods
      .filter((period) => period.streamType !== "FIXED_FEE")
      .map((period) => ({
        recorded: period.commissionShareAmount !== null,
        paid: Boolean(period.commissionPaidAt),
      }));
    const entries = [...fixed, ...commission];
    const recorded = entries.filter((entry) => entry.recorded).length;
    const paid = entries.filter((entry) => entry.paid).length;
    if (entries.length === 0 || recorded === 0) {
      return { label: "待录入", color: "bg-slate-100 text-slate-500" };
    }
    if (paid === entries.length) {
      return { label: "已完成", color: "bg-emerald-100 text-emerald-700" };
    }
    if (paid > 0) {
      return { label: "进行中", color: "bg-amber-100 text-amber-700" };
    }
    if (recorded < entries.length) {
      return { label: "录入中", color: "bg-blue-100 text-blue-700" };
    }
    return { label: "待付款", color: "bg-rose-100 text-rose-700" };
  }
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
  const statusOptions = ["待录入", "录入中", "待付款", "进行中", "已完成", "待结算", "待分账", "部分分账", "已分账"];

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
    return ({
      USD: "$",
      RMB: "¥",
      CNY: "¥",
      EUR: "€",
      GBP: "£",
      HKD: "HK$",
      美金: "$",
      人民币: "¥",
    } as Record<string, string>)[c] ?? `${c} `;
  }

  function moneyDisplay(amount: number, currency: string) {
    return `${sym(currency)}${amount.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function streamMoneyDisplay(
    periods: ChannelReconciliation["periods"],
    kind: "fixed" | "commission",
    fallbackCurrency: string,
  ) {
    const totals = new Map<string, number>();
    for (const period of periods) {
      const currency =
        (kind === "fixed"
          ? period.fixedFeeReceivedCurrency
          : period.commissionReceivedCurrency) ?? fallbackCurrency;
      const amount =
        (kind === "fixed"
          ? period.fixedFeeShareAmount
          : period.commissionShareAmount) ?? 0;
      totals.set(currency, (totals.get(currency) ?? 0) + amount);
    }
    return [...totals.entries()]
      .map(([currency, amount]) => moneyDisplay(amount, currency))
      .join(" · ");
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
                const fixedPeriods = cr.periods.filter((period) => period.streamType !== "COMMISSION");
                const commissionPeriods = cr.periods.filter((period) => period.streamType !== "FIXED_FEE");
                const paidFixed = fixedPeriods.filter((period) => period.fixedFeePaidAt).length;
                const paidComm = commissionPeriods.filter((period) => period.commissionPaidAt).length;
                const ruleFixedTotal = streamMoneyDisplay(fixedPeriods, "fixed", cr.fixedFeeReceivedCurrency);
                const ruleCommissionTotal = streamMoneyDisplay(commissionPeriods, "commission", cr.commissionReceivedCurrency);
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
                      {cr.recordMode === "RULE_DRIVEN" ? (
                        <span>{ruleFixedTotal}</span>
                      ) : cr.autoCreated ? (
                        cr.fixedFeeTotal != null ? (
                          <span>¥{cr.fixedFeeTotal.toLocaleString()}</span>
                        ) : <span className="text-slate-400">待设置</span>
                      ) : shareDisplay(cr.fixedFeeReceived, cr.fixedFeeShareAmount, cr.fixedFeeShareRate, cr.fixedFeeShareCurrency, cr.fixedFeeActualDate)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {cr.recordMode === "RULE_DRIVEN" ? (
                        <span>{ruleCommissionTotal}</span>
                      ) : cr.autoCreated ? (
                        cr.commissionTotal != null ? (
                          <span>¥{cr.commissionTotal.toLocaleString()}</span>
                        ) : <span className="text-slate-400">待设置</span>
                      ) : shareDisplay(cr.commissionReceived, cr.commissionShareAmount, cr.commissionShareRate, cr.commissionShareCurrency, cr.commissionActualDate)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {cr.recordMode === "RULE_DRIVEN" ? (
                        <div>
                          <div>固费 {paidFixed}/{fixedPeriods.length}</div>
                          <div className="text-slate-400">佣金 {paidComm}/{commissionPeriods.length}</div>
                        </div>
                      ) : cr.autoCreated ? (
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
                        {cr.recordMode === "RULE_DRIVEN" || cr.autoCreated ? "管理" : "编辑"}
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
