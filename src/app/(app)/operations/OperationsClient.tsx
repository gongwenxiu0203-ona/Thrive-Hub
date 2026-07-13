"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, X, RefreshCw, TrendingUp, Users, FileText, Target, Pencil, Trash2,
  CheckCircle2, AlertTriangle, Award,
} from "lucide-react";
import { EmployeeKpiTab } from "./EmployeeKpiTab";
import type { EmployeeKpiRow } from "@/actions/employeeKpi";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { cn, formatDate } from "@/lib/utils";
import {
  STAGE_LABELS, STAGE_ORDER, CLIENT_STATUS_LABELS, REVENUE_GRADE_COLORS,
  AR_STATUS_LABELS, AR_STATUS_COLORS, AR_RISK_COLORS,
} from "@/lib/financeOperations";
import {
  generateMonthlySnapshot, updateSnapshot,
  deleteSnapshot, createAR, updateAR, deleteAR, refreshArRisks,
  createPipeline, updatePipelineStage, updatePipeline, deletePipeline,
} from "@/actions/financeOperations";

// =============================================================================
// Types
// =============================================================================

export type SnapshotRow = {
  id: string;
  customerId: string | null;
  customerName: string;
  month: string;
  projectStartDate: string | null;
  clientStatus: string;
  monthlyFeeCurrency: string;
  monthlyFeeAmount: number;
  exchangeRate: number;
  monthlyFeeRmb: number;
  commissionRate: number;
  monthlyGmv: number;
  monthlyCommissionIncome: number;
  monthlyTotalIncome: number;
  monthlyReconciledGmv: number;
  cumulativeIncome: number;
  amOwnerName: string;
  bdOwnerName: string;
  revenueGrade: string;
  signingCompany: string | null;
  receivingCompany: string | null;
};

export type ArRow = {
  id: string;
  customerId: string | null;
  customerName: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceAmount: number;
  currency: string;
  exchangeRate: number;
  amountRmb: number;
  receivedAmount: number;
  dueDate: string;
  actualReceivedDate: string | null;
  status: string;
  riskLevel: string;
  followOwnerId: string | null;
  followOwnerName: string;
  remark: string | null;
};

export type PipelineRow = {
  id: string;
  prospectName: string;
  source: string | null;
  countryRegion: string | null;
  category: string | null;
  estimatedMonthlyFee: number | null;
  estimatedCommissionRate: number | null;
  estimatedGmv: number | null;
  stage: string;
  probability: number;
  expectedSignDate: string | null;
  bdOwnerId: string | null;
  bdOwnerName: string;
  nextAction: string | null;
  nextFollowUpAt: string | null;
  remark: string | null;
};

type Customer = { id: string; brandName: string };
type UserOption = { id: string; name: string };
type CountSummary = {
  newCount: number; activeCount: number; cumulativeCount: number;
  churnedCount: number; pausedCount: number;
  gradeS: number; gradeA: number; gradeB: number; gradeC: number;
};

type Tab = "revenue" | "count" | "ar" | "pipeline" | "kpi";

// =============================================================================
// Main component
// =============================================================================

export function OperationsClient({
  initialTab,
  month,
  snapshots,
  ars,
  pipelines,
  customers,
  users,
  countSummary,
  isAdmin,
  kpiRows,
  kpiAmOwnerId,
  kpiCustomerId,
  kpiProjectId,
  kpiProjects,
  kpiCustomers,
}: {
  initialTab: Tab;
  month: string;
  snapshots: SnapshotRow[];
  ars: ArRow[];
  pipelines: PipelineRow[];
  customers: Customer[];
  users: UserOption[];
  countSummary: CountSummary;
  isAdmin: boolean;
  kpiRows: EmployeeKpiRow[];
  kpiAmOwnerId: string;
  kpiCustomerId: string;
  kpiProjectId: string;
  kpiProjects: { id: string; name: string }[];
  kpiCustomers: Customer[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>(initialTab);

  function setTabUrl(t: Tab) {
    setTab(t);
    const params = new URLSearchParams(sp.toString());
    params.set("tab", t);
    router.replace(`/operations?${params.toString()}`);
  }

  function setMonth(m: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("month", m);
    router.push(`/operations?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="经营管理"
          description="客户收入 / 客户数统计 / 应收账款 / 销售漏斗"
        />
      </div>

      {/* Tabs */}
      <div className="tab-strip">
        {([
          { key: "revenue", label: "客户收入总表", icon: TrendingUp },
          { key: "count", label: "客户数统计", icon: Users },
          { key: "ar", label: "应收账款", icon: FileText },
          { key: "pipeline", label: "销售漏斗", icon: Target },
          { key: "kpi", label: "员工 KPI", icon: Award },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTabUrl(t.key)}
            className={cn(
              "tab-trigger",
              tab === t.key
                ? "tab-trigger-active"
                : "",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "revenue" && (
        <RevenueTab snapshots={snapshots} month={month} onMonthChange={setMonth} isAdmin={isAdmin} />
      )}
      {tab === "count" && (
        <ClientCountTab summary={countSummary} month={month} onMonthChange={setMonth} />
      )}
      {tab === "ar" && (
        <ARTab ars={ars} customers={customers} users={users} isAdmin={isAdmin} />
      )}
      {tab === "pipeline" && (
        <PipelineTab pipelines={pipelines} users={users} isAdmin={isAdmin} />
      )}
      {tab === "kpi" && (
        <EmployeeKpiTab
          rows={kpiRows}
          month={month}
          amOwnerId={kpiAmOwnerId}
          customerId={kpiCustomerId}
          projectId={kpiProjectId}
          isAdmin={isAdmin}
          users={users}
          customers={kpiCustomers}
          projects={kpiProjects}
        />
      )}
    </div>
  );
}

// =============================================================================
// Tab 1: Client Revenue Table
// =============================================================================

function formatMoney(amount: number, currency: string | null | undefined): string {
  const symbol = ({
    RMB: "¥",
    CNY: "¥",
    USD: "$",
    EUR: "€",
    GBP: "£",
    HKD: "HK$",
  } as Record<string, string>)[currency ?? ""] ?? `${currency ?? "USD"} `;
  return `${symbol}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function inferSingleCurrency(rows: SnapshotRow[]): string {
  const currencies = new Set(rows.map((row) => row.monthlyFeeCurrency || "USD"));
  return currencies.size === 1 ? [...currencies][0] : "USD";
}

function calcReconciledTotalRmb(row: SnapshotRow): number {
  return (row.monthlyFeeAmount + row.commissionRate * row.monthlyReconciledGmv) * row.exchangeRate;
}

function RevenueTab({
  snapshots, month, onMonthChange, isAdmin,
}: {
  snapshots: SnapshotRow[]; month: string; onMonthChange: (m: string) => void; isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<SnapshotRow | null>(null);

  const totals = useMemo(() => {
    const newCount = snapshots.filter((s) => s.clientStatus === "NEW").length;
    const churnedCount = snapshots.filter((s) => s.clientStatus === "CHURNED").length;
    const cumCustomerCount = snapshots.length;
    const mrr = snapshots.reduce((sum, s) => sum + s.monthlyFeeAmount, 0);
    const totalCommission = snapshots.reduce((sum, s) => sum + s.monthlyCommissionIncome, 0);
    const totalIncome = snapshots.reduce((sum, s) => sum + s.monthlyTotalIncome, 0);
    const currency = inferSingleCurrency(snapshots);
    return { newCount, churnedCount, cumCustomerCount, mrr, totalCommission, totalIncome, currency };
  }, [snapshots]);

  function runGenerate() {
    setNote(null);
    startTransition(async () => {
      const result = await generateMonthlySnapshot(month);
      if (!result.ok) { setNote(result.error ?? "生成失败"); return; }
      setNote(`✅ 完成：新增 ${result.created} 条，更新 ${result.updated} 条`);
      router.refresh();
    });
  }

  function onDeleteSnapshot(row: SnapshotRow) {
    if (!confirm(`确认删除「${row.customerName}」在 ${row.month} 的客户收入记录？\n\n只会删除本条经营管理快照，不会删除客户、合同或 BI 数据。`)) return;
    setNote(null);
    startTransition(async () => {
      const result = await deleteSnapshot(row.id);
      if (!result.ok) { setNote(result.error ?? "删除失败"); return; }
      setNote("✅ 已删除客户收入记录");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">月份：</label>
          <input type="month" className="input h-9 w-36 text-sm"
            value={month} onChange={(e) => onMonthChange(e.target.value)} />
        </div>
        {isAdmin && (
          <button onClick={runGenerate} disabled={pending} className="btn-primary text-sm">
            <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
            {pending ? "生成中…" : "一键生成 / 刷新当月快照"}
          </button>
        )}
        {note && (
          <span className={cn("text-xs", note.startsWith("✅") ? "text-emerald-600" : "text-rose-500")}>
            {note}
          </span>
        )}
      </div>

      {/* Summary metrics */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="新增客户数" value={totals.newCount} />
        <StatCard label="本月客户数" value={totals.cumCustomerCount} />
        <StatCard label="流失客户数" value={totals.churnedCount} accent="text-rose-600" />
        <StatCard label="MRR" value={formatMoney(totals.mrr, totals.currency)} accent="text-brand-600" />
        <StatCard label="预估月佣金收入" value={formatMoney(totals.totalCommission, totals.currency)} accent="text-amber-600" />
        <StatCard label="预估月总收入" value={formatMoney(totals.totalIncome, totals.currency)} accent="text-emerald-600" />
      </div>

      {/* Snapshot table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
              <th rowSpan={2} className="px-3 py-2 text-left font-medium align-bottom">客户</th>
              <th rowSpan={2} className="px-3 py-2 text-left font-medium align-bottom">项目开始</th>
              <th rowSpan={2} className="px-3 py-2 text-left font-medium align-bottom">状态</th>
              <th colSpan={5} className="border-l border-slate-200 px-3 py-2 text-center font-semibold text-slate-600">预估收入（原币种）</th>
              <th colSpan={3} className="border-l border-slate-200 px-3 py-2 text-center font-semibold text-slate-600">对账后收入（RMB）</th>
              <th rowSpan={2} className="px-3 py-2 text-left font-medium align-bottom">AM</th>
              <th rowSpan={2} className="px-3 py-2 text-left font-medium align-bottom">BD</th>
              <th rowSpan={2} className="px-3 py-2 text-left font-medium align-bottom">等级</th>
              <th rowSpan={2} className="px-3 py-2 align-bottom"></th>
            </tr>
            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
              <th className="px-3 py-2 text-right font-medium">月费</th>
              <th className="px-3 py-2 text-right font-medium">抽佣</th>
              <th className="px-3 py-2 text-right font-medium">月 GMV</th>
              <th className="px-3 py-2 text-right font-medium">预估月佣金收入</th>
              <th className="px-3 py-2 text-right font-medium">预估月总收入</th>
              <th className="border-l border-slate-200 px-3 py-2 text-right font-medium">月对账GMV</th>
              <th className="px-3 py-2 text-right font-medium">汇率</th>
              <th className="px-3 py-2 text-right font-medium">当月总收入(RMB)</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.length === 0 ? (
              <tr><td colSpan={15} className="py-10 text-center text-slate-400">暂无快照，点击「一键生成」按月汇总</td></tr>
            ) : snapshots.map((s) => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-3 py-2 font-medium text-slate-800">
                  {s.customerId ? <Link href={`/customers/${s.customerId}`} className="hover:text-brand-600 hover:underline">{s.customerName}</Link> : s.customerName}
                </td>
                <td className="px-3 py-2 text-slate-500">{s.projectStartDate ? formatDate(s.projectStartDate) : "—"}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                    {CLIENT_STATUS_LABELS[s.clientStatus] ?? s.clientStatus}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{formatMoney(s.monthlyFeeAmount, s.monthlyFeeCurrency)}</td>
                <td className="px-3 py-2 text-right">{(s.commissionRate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2 text-right">{formatMoney(s.monthlyGmv, s.monthlyFeeCurrency)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(s.monthlyCommissionIncome, s.monthlyFeeCurrency)}</td>
                <td className="px-3 py-2 text-right font-semibold text-emerald-700">{formatMoney(s.monthlyTotalIncome, s.monthlyFeeCurrency)}</td>
                <td className="border-l border-slate-200 px-3 py-2 text-right">{formatMoney(s.monthlyReconciledGmv, s.monthlyFeeCurrency)}</td>
                <td className="px-3 py-2 text-right text-slate-500">{s.exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                <td className="px-3 py-2 text-right font-semibold text-brand-700">¥{calcReconciledTotalRmb(s).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-2 text-slate-600">{s.amOwnerName}</td>
                <td className="px-3 py-2 text-slate-600">{s.bdOwnerName}</td>
                <td className="px-3 py-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", REVENUE_GRADE_COLORS[s.revenueGrade] ?? "bg-slate-100 text-slate-500")}>
                    {s.revenueGrade}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {isAdmin && (
                    <span className="flex justify-end gap-1">
                      <button onClick={() => setEditing(s)} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600" title="编辑">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onDeleteSnapshot(s)} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500" title="删除客户收入记录">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <SnapshotEditModal snapshot={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function SnapshotEditModal({ snapshot, onClose }: { snapshot: SnapshotRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [grade, setGrade] = useState(snapshot.revenueGrade);
  const [signing, setSigning] = useState<string>(snapshot.signingCompany ?? "");
  const [receiving, setReceiving] = useState<string>(snapshot.receivingCompany ?? "");
  const [status, setStatus] = useState<string>(snapshot.clientStatus);
  const [exchangeRate, setExchangeRate] = useState<string>(
    snapshot.exchangeRate > 0 ? snapshot.exchangeRate.toString() : "1",
  );
  const [err, setErr] = useState<string | null>(null);

  function onSave() {
    startTransition(async () => {
      const parsedRate = parseFloat(exchangeRate);
      const r = await updateSnapshot(snapshot.id, {
        revenueGrade: grade,
        signingCompany: signing || null,
        receivingCompany: receiving || null,
        clientStatus: status,
        exchangeRate: Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 1,
      });
      if (!r.ok) { setErr(r.error ?? "保存失败"); return; }
      onClose(); router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">编辑快照（{snapshot.customerName}）</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="label">经营等级</label>
            <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
              {["S","A","B","C"].map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">默认按月收入自动计算：S≥10万、A≥5万、B≥2万、C&lt;2万</p>
          </div>
          <div>
            <label className="label">客户状态</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(CLIENT_STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">对账后收入汇率</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              className="input"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              用于计算当月总收入(RMB)：（月费 + 抽佣 × 月对账GMV）× 汇率
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">签约公司</label>
              <select className="input" value={signing} onChange={(e) => setSigning(e.target.value)}>
                <option value="">未选</option>
                <option value="FOSHAN">FOSHAN 佛山</option>
                <option value="HONGKONG">HONGKONG 香港</option>
              </select>
            </div>
            <div>
              <label className="label">收款公司</label>
              <select className="input" value={receiving} onChange={(e) => setReceiving(e.target.value)}>
                <option value="">未选</option>
                <option value="FOSHAN">FOSHAN 佛山</option>
                <option value="HONGKONG">HONGKONG 香港</option>
              </select>
            </div>
          </div>
          {err && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{err}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button onClick={onSave} disabled={pending} className="btn-primary text-sm">{pending ? "保存中…" : "保存"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Tab 2: Client Count Summary
// =============================================================================

function ClientCountTab({
  summary, month, onMonthChange,
}: { summary: CountSummary; month: string; onMonthChange: (m: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <label className="text-xs text-slate-500">月份：</label>
        <input type="month" className="input h-9 w-36 text-sm" value={month} onChange={(e) => onMonthChange(e.target.value)} />
        <p className="text-xs text-slate-400">基于当月快照统计。如指标为 0，请先到「客户收入总表」一键生成快照</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="本月新增" value={summary.newCount} accent="text-emerald-600" />
        <StatCard label="当前服务中" value={summary.activeCount} accent="text-brand-600" />
        <StatCard label="累计签约客户" value={summary.cumulativeCount} />
        <StatCard label="本月流失" value={summary.churnedCount} accent="text-rose-600" />
        <StatCard label="暂停服务" value={summary.pausedCount} accent="text-amber-600" />
      </div>
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">收入等级分布（基于本月快照）</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          {(["S","A","B","C"] as const).map((g) => (
            <div key={g} className="rounded-2xl border border-slate-200 p-4 text-center">
              <span className={cn("inline-block rounded px-3 py-1 text-sm font-bold", REVENUE_GRADE_COLORS[g])}>{g} 级</span>
              <p className="mt-2 text-2xl font-bold text-slate-800">
                {g === "S" ? summary.gradeS : g === "A" ? summary.gradeA : g === "B" ? summary.gradeB : summary.gradeC}
              </p>
              <p className="text-[11px] text-slate-400">
                {g === "S" ? "月收入≥10万" : g === "A" ? "5-10万" : g === "B" ? "2-5万" : "<2万"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Tab 3: Accounts Receivable
// =============================================================================

function ARTab({
  ars, customers, users, isAdmin,
}: { ars: ArRow[]; customers: Customer[]; users: UserOption[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ArRow | null>(null);
  const [filterCust, setFilterCust] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterRisk, setFilterRisk] = useState("");
  const [filterOwner, setFilterOwner] = useState("");

  const filtered = useMemo(() => {
    return ars.filter((a) => {
      if (filterCust && a.customerId !== filterCust) return false;
      if (filterRisk && a.riskLevel !== filterRisk) return false;
      if (filterOwner && a.followOwnerId !== filterOwner) return false;
      if (filterMonth) {
        const d = a.invoiceDate.slice(0, 7); // YYYY-MM
        if (d !== filterMonth) return false;
      }
      return true;
    });
  }, [ars, filterCust, filterMonth, filterRisk, filterOwner]);

  const totals = useMemo(() => {
    const totalInvoice = filtered.reduce((s, a) => s + a.amountRmb, 0);
    const totalReceived = filtered.reduce((s, a) => s + (a.receivedAmount * (a.currency === "USD" ? a.exchangeRate : 1)), 0);
    const totalUnreceived = totalInvoice - totalReceived;
    const totalOverdue = filtered.filter((a) => a.status === "OVERDUE").reduce((s, a) => s + (a.amountRmb - a.receivedAmount * (a.currency === "USD" ? a.exchangeRate : 1)), 0);
    const totalRed = filtered.filter((a) => a.riskLevel === "RED").reduce((s, a) => s + (a.amountRmb - a.receivedAmount * (a.currency === "USD" ? a.exchangeRate : 1)), 0);
    return { totalInvoice, totalReceived, totalUnreceived, totalOverdue, totalRed };
  }, [filtered]);

  function onRefresh() {
    startTransition(async () => {
      await refreshArRisks();
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm("确认删除该应收账款记录？")) return;
    startTransition(async () => { await deleteAR(id); router.refresh(); });
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <select className="input h-9 w-40 text-sm" value={filterCust} onChange={(e) => setFilterCust(e.target.value)}>
          <option value="">全部客户</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.brandName}</option>)}
        </select>
        <input type="month" className="input h-9 w-36 text-sm" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} placeholder="开票月份" />
        <select className="input h-9 w-32 text-sm" value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
          <option value="">全部风险</option>
          <option value="GREEN">绿色 — 正常</option>
          <option value="YELLOW">黄色 — 轻度</option>
          <option value="ORANGE">橙色 — 中度</option>
          <option value="RED">红色 — 严重</option>
        </select>
        <select className="input h-9 w-32 text-sm" value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)}>
          <option value="">全部跟进人</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button onClick={onRefresh} disabled={pending} className="btn-secondary text-sm">
          <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />刷新风险
        </button>
        <button onClick={() => setShowCreate(true)} className="btn-primary ml-auto text-sm">
          <Plus className="h-4 w-4" />新增应收
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="应收总额 (RMB)" value={`¥${totals.totalInvoice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatCard label="已收总额" value={`¥${totals.totalReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} accent="text-emerald-600" />
        <StatCard label="未收余额" value={`¥${totals.totalUnreceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} accent="text-amber-600" />
        <StatCard label="超期金额" value={`¥${totals.totalOverdue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} accent="text-rose-600" />
        <StatCard label="红色风险" value={`¥${totals.totalRed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} accent="text-rose-700" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
              <th className="px-3 py-2 text-left font-medium">发票号</th>
              <th className="px-3 py-2 text-left font-medium">客户</th>
              <th className="px-3 py-2 text-left font-medium">开票日</th>
              <th className="px-3 py-2 text-right font-medium">发票金额</th>
              <th className="px-3 py-2 text-right font-medium">RMB</th>
              <th className="px-3 py-2 text-right font-medium">已收</th>
              <th className="px-3 py-2 text-right font-medium">未收</th>
              <th className="px-3 py-2 text-left font-medium">到期日</th>
              <th className="px-3 py-2 text-left font-medium">状态</th>
              <th className="px-3 py-2 text-left font-medium">风险</th>
              <th className="px-3 py-2 text-left font-medium">跟进人</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={12} className="py-10 text-center text-slate-400">暂无应收记录</td></tr>
            ) : filtered.map((a) => {
              const receivedRmb = a.receivedAmount * (a.currency === "USD" ? a.exchangeRate : 1);
              const unreceived = a.amountRmb - receivedRmb;
              return (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2 font-mono text-slate-700">{a.invoiceNo}</td>
                  <td className="px-3 py-2 text-slate-800">
                    {a.customerId ? <Link href={`/customers/${a.customerId}`} className="hover:text-brand-600 hover:underline">{a.customerName}</Link> : a.customerName}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatDate(a.invoiceDate)}</td>
                  <td className="px-3 py-2 text-right">{a.currency === "USD" ? "$" : "¥"}{a.invoiceAmount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">¥{a.amountRmb.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2 text-right text-emerald-600">¥{receivedRmb.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className={cn("px-3 py-2 text-right font-medium", unreceived > 0 ? "text-amber-600" : "text-slate-400")}>¥{unreceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2 text-slate-500">{formatDate(a.dueDate)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", AR_STATUS_COLORS[a.status])}>{AR_STATUS_LABELS[a.status]}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-block h-3 w-3 rounded-full", AR_RISK_COLORS[a.riskLevel])} title={a.riskLevel}></span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{a.followOwnerName}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="flex justify-end gap-1">
                      <button onClick={() => setEditing(a)} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {isAdmin && (
                        <button onClick={() => onDelete(a.id)} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCreate && <ARCreateModal customers={customers} users={users} onClose={() => setShowCreate(false)} />}
      {editing && <AREditModal ar={editing} users={users} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ARCreateModal({ customers, users, onClose }: { customers: Customer[]; users: UserOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({
    customerId: "", invoiceNo: "", invoiceDate: "", invoiceAmount: "",
    currency: "USD" as "USD" | "RMB", exchangeRate: "7.2",
    dueDate: "", followOwnerId: "", remark: "",
  });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: typeof f[K]) { setF((p) => ({ ...p, [k]: v })); }

  function onSubmit() {
    setErr(null);
    startTransition(async () => {
      const r = await createAR({
        customerId: f.customerId || null,
        invoiceNo: f.invoiceNo,
        invoiceDate: f.invoiceDate,
        invoiceAmount: parseFloat(f.invoiceAmount),
        currency: f.currency,
        exchangeRate: parseFloat(f.exchangeRate),
        dueDate: f.dueDate,
        followOwnerId: f.followOwnerId || null,
        remark: f.remark || null,
      });
      if (!r.ok) { setErr(r.error ?? "保存失败"); return; }
      onClose(); router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">新增应收账款</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">发票号 *</label>
              <input className="input" value={f.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} placeholder="INV-2026-001" />
            </div>
            <div>
              <label className="label">客户</label>
              <select className="input" value={f.customerId} onChange={(e) => set("customerId", e.target.value)}>
                <option value="">未关联</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.brandName}</option>)}
              </select>
            </div>
            <div>
              <label className="label">开票日期 *</label>
              <input type="date" className="input" value={f.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} />
            </div>
            <div>
              <label className="label">应收到期日 *</label>
              <input type="date" className="input" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </div>
            <div>
              <label className="label">发票金额 *</label>
              <input type="number" step="0.01" className="input" value={f.invoiceAmount} onChange={(e) => set("invoiceAmount", e.target.value)} />
            </div>
            <div>
              <label className="label">货币</label>
              <select className="input" value={f.currency} onChange={(e) => set("currency", e.target.value as "USD" | "RMB")}>
                <option value="USD">USD</option><option value="RMB">RMB</option>
              </select>
            </div>
            {f.currency === "USD" && (
              <div>
                <label className="label">USD→RMB 汇率</label>
                <input type="number" step="0.01" className="input" value={f.exchangeRate} onChange={(e) => set("exchangeRate", e.target.value)} />
              </div>
            )}
            <div>
              <label className="label">跟进人</label>
              <select className="input" value={f.followOwnerId} onChange={(e) => set("followOwnerId", e.target.value)}>
                <option value="">未指定</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">备注</label>
            <textarea className="input min-h-[60px]" value={f.remark} onChange={(e) => set("remark", e.target.value)} />
          </div>
          {err && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{err}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button onClick={onSubmit} disabled={pending} className="btn-primary text-sm">{pending ? "保存中…" : "新增"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AREditModal({ ar, users, onClose }: { ar: ArRow; users: UserOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receivedAmount, setReceivedAmount] = useState(String(ar.receivedAmount));
  const [actualReceivedDate, setActualReceivedDate] = useState(ar.actualReceivedDate?.slice(0, 10) ?? "");
  const [followOwnerId, setFollowOwnerId] = useState(ar.followOwnerId ?? "");
  const [remark, setRemark] = useState(ar.remark ?? "");
  const [err, setErr] = useState<string | null>(null);

  function onSave() {
    startTransition(async () => {
      const r = await updateAR(ar.id, {
        receivedAmount: parseFloat(receivedAmount) || 0,
        actualReceivedDate: actualReceivedDate || null,
        followOwnerId: followOwnerId || null,
        remark: remark || null,
      });
      if (!r.ok) { setErr(r.error ?? "保存失败"); return; }
      onClose(); router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">编辑 {ar.invoiceNo}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="label">已收金额（{ar.currency}）</label>
            <input type="number" step="0.01" className="input" value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">实际收款日期</label>
            <input type="date" className="input" value={actualReceivedDate} onChange={(e) => setActualReceivedDate(e.target.value)} />
          </div>
          <div>
            <label className="label">跟进人</label>
            <select className="input" value={followOwnerId} onChange={(e) => setFollowOwnerId(e.target.value)}>
              <option value="">未指定</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">备注</label>
            <textarea className="input min-h-[60px]" value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
          {err && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{err}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button onClick={onSave} disabled={pending} className="btn-primary text-sm">{pending ? "保存中…" : "保存"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Tab 4: Sales Pipeline
// =============================================================================

function PipelineTab({
  pipelines, users, isAdmin,
}: { pipelines: PipelineRow[]; users: UserOption[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PipelineRow | null>(null);
  const [filterStage, setFilterStage] = useState("");
  const [filterOwner, setFilterOwner] = useState("");

  const filtered = useMemo(() => {
    return pipelines.filter((p) => {
      if (filterStage && p.stage !== filterStage) return false;
      if (filterOwner && p.bdOwnerId !== filterOwner) return false;
      return true;
    });
  }, [pipelines, filterStage, filterOwner]);

  const totals = useMemo(() => {
    const active = filtered.filter((p) => p.stage !== "WON" && p.stage !== "LOST");
    const totalFee = active.reduce((s, p) => s + (p.estimatedMonthlyFee ?? 0), 0);
    const totalGmv = active.reduce((s, p) => s + (p.estimatedGmv ?? 0), 0);
    const totalCommission = active.reduce((s, p) => s + (p.estimatedGmv ?? 0) * ((p.estimatedCommissionRate ?? 0) / 100), 0);
    const weighted = active.reduce((s, p) => s + ((p.estimatedMonthlyFee ?? 0) * (p.probability / 100)), 0);
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}`;
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthKey = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2,"0")}`;
    const thisMonthClose = active.filter((p) => p.expectedSignDate?.slice(0, 7) === thisMonthKey).length;
    const nextMonthClose = active.filter((p) => p.expectedSignDate?.slice(0, 7) === nextMonthKey).length;
    return { count: active.length, totalFee, totalGmv, totalCommission, weighted, thisMonthClose, nextMonthClose };
  }, [filtered]);

  // Aggregate by BD owner
  const bdSummary = useMemo(() => {
    const map = new Map<string, { name: string; count: number; weighted: number; totalFee: number }>();
    for (const p of filtered) {
      if (p.stage === "WON" || p.stage === "LOST") continue;
      const key = p.bdOwnerId ?? "—";
      const cur = map.get(key) ?? { name: p.bdOwnerName, count: 0, weighted: 0, totalFee: 0 };
      cur.count++;
      cur.weighted += (p.estimatedMonthlyFee ?? 0) * (p.probability / 100);
      cur.totalFee += (p.estimatedMonthlyFee ?? 0);
      map.set(key, cur);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.weighted - a.weighted);
  }, [filtered]);

  function onDelete(id: string) {
    if (!confirm("确认删除该漏斗记录？")) return;
    startTransition(async () => { await deletePipeline(id); router.refresh(); });
  }

  function onStageChange(id: string, stage: string) {
    startTransition(async () => { await updatePipelineStage(id, stage); router.refresh(); });
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <select className="input h-9 w-44 text-sm" value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
          <option value="">全部阶段</option>
          {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        <select className="input h-9 w-32 text-sm" value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)}>
          <option value="">全部 BD</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button onClick={() => setShowCreate(true)} className="btn-primary ml-auto text-sm">
          <Plus className="h-4 w-4" />新增漏斗
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Pipeline 客户" value={totals.count} />
        <StatCard label="预计月费总额" value={`¥${totals.totalFee.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatCard label="预计佣金" value={`¥${totals.totalCommission.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} accent="text-amber-600" />
        <StatCard label="加权金额" value={`¥${totals.weighted.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} accent="text-brand-600" />
        <StatCard label="本月预计成交" value={totals.thisMonthClose} accent="text-emerald-600" />
        <StatCard label="下月预计成交" value={totals.nextMonthClose} accent="text-emerald-500" />
      </div>

      {bdSummary.length > 0 && (
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">BD 负责人 Pipeline 汇总</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {bdSummary.map((b) => (
              <div key={b.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <p className="text-sm font-medium text-slate-800">{b.name}</p>
                <p className="mt-1 text-xs text-slate-500">{b.count} 个客户 · 总月费 ¥{b.totalFee.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="mt-0.5 text-sm font-semibold text-brand-700">加权 ¥{b.weighted.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
              <th className="px-3 py-2 text-left font-medium">客户名称</th>
              <th className="px-3 py-2 text-left font-medium">来源</th>
              <th className="px-3 py-2 text-left font-medium">地区</th>
              <th className="px-3 py-2 text-right font-medium">预计月费</th>
              <th className="px-3 py-2 text-right font-medium">预计 GMV</th>
              <th className="px-3 py-2 text-left font-medium">阶段</th>
              <th className="px-3 py-2 text-right font-medium">概率</th>
              <th className="px-3 py-2 text-left font-medium">预计签约</th>
              <th className="px-3 py-2 text-left font-medium">BD</th>
              <th className="px-3 py-2 text-left font-medium">下一步</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={11} className="py-10 text-center text-slate-400">暂无销售漏斗记录</td></tr>
            ) : filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-3 py-2 font-medium text-slate-800">{p.prospectName}</td>
                <td className="px-3 py-2 text-slate-500">{p.source ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{p.countryRegion ?? "—"}</td>
                <td className="px-3 py-2 text-right">{p.estimatedMonthlyFee ? `¥${p.estimatedMonthlyFee.toLocaleString()}` : "—"}</td>
                <td className="px-3 py-2 text-right">{p.estimatedGmv ? `$${p.estimatedGmv.toLocaleString()}` : "—"}</td>
                <td className="px-3 py-2">
                  <select className="input h-7 text-xs" value={p.stage} onChange={(e) => onStageChange(p.id, e.target.value)}>
                    {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s].split(" ")[0]}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-right font-medium text-brand-700">{p.probability}%</td>
                <td className="px-3 py-2 text-slate-500">{p.expectedSignDate ? formatDate(p.expectedSignDate) : "—"}</td>
                <td className="px-3 py-2 text-slate-600">{p.bdOwnerName}</td>
                <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{p.nextAction ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <span className="flex justify-end gap-1">
                    <button onClick={() => setEditing(p)} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {isAdmin && (
                      <button onClick={() => onDelete(p.id)} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <PipelineCreateModal users={users} onClose={() => setShowCreate(false)} />}
      {editing && <PipelineEditModal pipeline={editing} users={users} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PipelineCreateModal({ users, onClose }: { users: UserOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({
    prospectName: "", source: "", countryRegion: "", category: "",
    estimatedMonthlyFee: "", estimatedCommissionRate: "", estimatedGmv: "",
    stage: "LEAD", expectedSignDate: "", bdOwnerId: "",
    nextAction: "", nextFollowUpAt: "", remark: "",
  });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: typeof f[K]) { setF((p) => ({ ...p, [k]: v })); }

  function onSubmit() {
    setErr(null);
    startTransition(async () => {
      const r = await createPipeline({
        prospectName: f.prospectName,
        source: f.source || null,
        countryRegion: f.countryRegion || null,
        category: f.category || null,
        estimatedMonthlyFee: f.estimatedMonthlyFee ? parseFloat(f.estimatedMonthlyFee) : null,
        estimatedCommissionRate: f.estimatedCommissionRate ? parseFloat(f.estimatedCommissionRate) : null,
        estimatedGmv: f.estimatedGmv ? parseFloat(f.estimatedGmv) : null,
        stage: f.stage,
        expectedSignDate: f.expectedSignDate || null,
        bdOwnerId: f.bdOwnerId || null,
        nextAction: f.nextAction || null,
        nextFollowUpAt: f.nextFollowUpAt || null,
        remark: f.remark || null,
      });
      if (!r.ok) { setErr(r.error ?? "保存失败"); return; }
      onClose(); router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">新增销售漏斗</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">潜在客户名称 *</label>
              <input className="input" value={f.prospectName} onChange={(e) => set("prospectName", e.target.value)} />
            </div>
            <div>
              <label className="label">客户来源</label>
              <input className="input" value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="如：邮件 / 推荐 / 展会" />
            </div>
            <div>
              <label className="label">地区</label>
              <input className="input" value={f.countryRegion} onChange={(e) => set("countryRegion", e.target.value)} />
            </div>
            <div>
              <label className="label">品类</label>
              <input className="input" value={f.category} onChange={(e) => set("category", e.target.value)} />
            </div>
            <div>
              <label className="label">阶段</label>
              <select className="input" value={f.stage} onChange={(e) => set("stage", e.target.value)}>
                {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">预计月费 (RMB)</label>
              <input type="number" step="0.01" className="input" value={f.estimatedMonthlyFee} onChange={(e) => set("estimatedMonthlyFee", e.target.value)} />
            </div>
            <div>
              <label className="label">预计佣金比例(%)</label>
              <input type="number" step="0.01" className="input" value={f.estimatedCommissionRate} onChange={(e) => set("estimatedCommissionRate", e.target.value)} />
            </div>
            <div>
              <label className="label">预计 GMV (USD)</label>
              <input type="number" step="0.01" className="input" value={f.estimatedGmv} onChange={(e) => set("estimatedGmv", e.target.value)} />
            </div>
            <div>
              <label className="label">预计签约日</label>
              <input type="date" className="input" value={f.expectedSignDate} onChange={(e) => set("expectedSignDate", e.target.value)} />
            </div>
            <div>
              <label className="label">BD 负责人</label>
              <select className="input" value={f.bdOwnerId} onChange={(e) => set("bdOwnerId", e.target.value)}>
                <option value="">未指定</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">下次跟进时间</label>
              <input type="date" className="input" value={f.nextFollowUpAt} onChange={(e) => set("nextFollowUpAt", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">下一步动作</label>
              <input className="input" value={f.nextAction} onChange={(e) => set("nextAction", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">备注</label>
              <textarea className="input min-h-[60px]" value={f.remark} onChange={(e) => set("remark", e.target.value)} />
            </div>
          </div>
          {err && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{err}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button onClick={onSubmit} disabled={pending} className="btn-primary text-sm">{pending ? "保存中…" : "新增"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineEditModal({ pipeline, users, onClose }: { pipeline: PipelineRow; users: UserOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({
    prospectName: pipeline.prospectName,
    source: pipeline.source ?? "",
    countryRegion: pipeline.countryRegion ?? "",
    category: pipeline.category ?? "",
    estimatedMonthlyFee: pipeline.estimatedMonthlyFee?.toString() ?? "",
    estimatedCommissionRate: pipeline.estimatedCommissionRate?.toString() ?? "",
    estimatedGmv: pipeline.estimatedGmv?.toString() ?? "",
    stage: pipeline.stage,
    expectedSignDate: pipeline.expectedSignDate?.slice(0, 10) ?? "",
    bdOwnerId: pipeline.bdOwnerId ?? "",
    nextAction: pipeline.nextAction ?? "",
    nextFollowUpAt: pipeline.nextFollowUpAt?.slice(0, 10) ?? "",
    remark: pipeline.remark ?? "",
  });
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: typeof f[K]) { setF((p) => ({ ...p, [k]: v })); }

  function onSave() {
    startTransition(async () => {
      const r = await updatePipeline(pipeline.id, {
        prospectName: f.prospectName,
        source: f.source || null,
        countryRegion: f.countryRegion || null,
        category: f.category || null,
        estimatedMonthlyFee: f.estimatedMonthlyFee ? parseFloat(f.estimatedMonthlyFee) : null,
        estimatedCommissionRate: f.estimatedCommissionRate ? parseFloat(f.estimatedCommissionRate) : null,
        estimatedGmv: f.estimatedGmv ? parseFloat(f.estimatedGmv) : null,
        stage: f.stage,
        expectedSignDate: f.expectedSignDate || null,
        bdOwnerId: f.bdOwnerId || null,
        nextAction: f.nextAction || null,
        nextFollowUpAt: f.nextFollowUpAt || null,
        remark: f.remark || null,
      });
      if (!r.ok) { setErr(r.error ?? "保存失败"); return; }
      onClose(); router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">编辑：{pipeline.prospectName}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">客户名称 *</label>
              <input className="input" value={f.prospectName} onChange={(e) => set("prospectName", e.target.value)} />
            </div>
            <div><label className="label">来源</label><input className="input" value={f.source} onChange={(e) => set("source", e.target.value)} /></div>
            <div><label className="label">地区</label><input className="input" value={f.countryRegion} onChange={(e) => set("countryRegion", e.target.value)} /></div>
            <div><label className="label">品类</label><input className="input" value={f.category} onChange={(e) => set("category", e.target.value)} /></div>
            <div>
              <label className="label">阶段</label>
              <select className="input" value={f.stage} onChange={(e) => set("stage", e.target.value)}>
                {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
            </div>
            <div><label className="label">预计月费</label><input type="number" step="0.01" className="input" value={f.estimatedMonthlyFee} onChange={(e) => set("estimatedMonthlyFee", e.target.value)} /></div>
            <div><label className="label">佣金比例(%)</label><input type="number" step="0.01" className="input" value={f.estimatedCommissionRate} onChange={(e) => set("estimatedCommissionRate", e.target.value)} /></div>
            <div><label className="label">预计 GMV</label><input type="number" step="0.01" className="input" value={f.estimatedGmv} onChange={(e) => set("estimatedGmv", e.target.value)} /></div>
            <div><label className="label">预计签约日</label><input type="date" className="input" value={f.expectedSignDate} onChange={(e) => set("expectedSignDate", e.target.value)} /></div>
            <div>
              <label className="label">BD 负责人</label>
              <select className="input" value={f.bdOwnerId} onChange={(e) => set("bdOwnerId", e.target.value)}>
                <option value="">未指定</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div><label className="label">下次跟进</label><input type="date" className="input" value={f.nextFollowUpAt} onChange={(e) => set("nextFollowUpAt", e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="label">下一步</label><input className="input" value={f.nextAction} onChange={(e) => set("nextAction", e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="label">备注</label><textarea className="input min-h-[60px]" value={f.remark} onChange={(e) => set("remark", e.target.value)} /></div>
          </div>
          {err && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{err}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button onClick={onSave} disabled={pending} className="btn-primary text-sm">{pending ? "保存中…" : "保存"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Unused-import suppressor (kept for future use; silences ESLint unused-import rule)
const _unused = { CheckCircle2, AlertTriangle };
void _unused;
