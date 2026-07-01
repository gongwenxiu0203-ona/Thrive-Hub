"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Settings, CheckCircle2, DollarSign, TrendingUp, Calendar, Clock,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { PeriodDerived } from "@/lib/channelSplit";
import {
  ChannelReconciliationDetailModal,
  type ChannelReconciliationRecord,
  type CRPeriod,
} from "../../ChannelReconciliationDetailModal";

export interface DetailRecord {
  id: string;
  autoCreated: boolean;
  totalPeriods: number | null;
  periodType: string | null;
  fixedFeeTotal: number | null;
  commissionTotal: number | null;
  fixedFeeShareRate: number;
  commissionShareRate: number;
  customer: { id: string; brandName: string };
  contract: { id: string; contractNo: string } | null;
  channelUser: { id: string; name: string };
  periodNo: number;
  periodStart: string | null;
  periodEnd: string | null;
  fixedFeeReceived: number | null;
  fixedFeeShareAmount: number;
  fixedFeeShareCurrency: string;
  fixedFeeEstimatedDate: string | null;
  fixedFeeActualDate: string | null;
  fixedFeeProofUrl: string | null;
  fixedFeePushedToChannel: boolean;
  commissionReceived: number | null;
  commissionShareAmount: number;
  commissionShareCurrency: string;
  commissionEstimatedDate: string | null;
  commissionActualDate: string | null;
  commissionProofUrl: string | null;
  commissionPushedToChannel: boolean;
  splitRule: {
    id: string;
    ruleType: string;
    splitEndDate: string;
    fixedFeeRate: number;
    commissionRate: number | null;
    tieredRules: string;
  } | null;
  periods: {
    id: string;
    periodIndex: number;
    periodLabel: string | null;
    fixedFeeAmount: number | null;
    commissionAmount: number | null;
    fixedFeePaidAt: string | null;
    commissionPaidAt: string | null;
    proofUrl: string | null;
    notes: string | null;
  }[];
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `¥${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

type WaterfallEvent = {
  at: string;
  kind: "confirmed" | "received_fee" | "received_commission";
  title: string;
  amount: string;        // formatted money
  period: string;        // YYYY-MM label
  dueDate?: string | null;
};

function buildWaterfall(derived: PeriodDerived[]): WaterfallEvent[] {
  const events: WaterfallEvent[] = [];
  for (const p of derived) {
    // 客户对账确认（用 feeReceivedAt/commissionReceivedAt 之前的"确认"时间，简化为收款日之前）
    // 这里以"已确认"视为：confirmedFee 不为 null（CR.status === "CONFIRMED"）
    if (p.confirmedFee !== null || p.confirmedCommission !== null) {
      // No explicit confirmedAt — use earliest received date as a proxy timestamp,
      // or fall back to a synthetic timestamp based on the period month.
      const proxyAt =
        p.feeReceivedAt ?? p.commissionReceivedAt ?? `${p.monthLabel}-01T00:00:00Z`;
      events.push({
        at: proxyAt,
        kind: "confirmed",
        title: `${p.monthLabel} 客户对账确认`,
        amount: `固费 ${fmtMoney(p.confirmedFee)} · 佣金 ${fmtMoney(p.confirmedCommission)}`,
        period: p.monthLabel,
      });
    }
    if (p.feeReceivedAt) {
      events.push({
        at: p.feeReceivedAt,
        kind: "received_fee",
        title: `${p.monthLabel} Thraive 收到固费`,
        amount: fmtMoney(p.confirmedFee),
        period: p.monthLabel,
        dueDate: p.dueDate,
      });
    }
    if (p.commissionReceivedAt) {
      events.push({
        at: p.commissionReceivedAt,
        kind: "received_commission",
        title: `${p.monthLabel} Thraive 收到佣金`,
        amount: fmtMoney(p.confirmedCommission),
        period: p.monthLabel,
        dueDate: p.dueDate,
      });
    }
  }
  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const KIND_BADGE: Record<WaterfallEvent["kind"], { color: string; label: string; icon: typeof CheckCircle2 }> = {
  confirmed: { color: "bg-amber-100 text-amber-700 border-amber-200", label: "对账确认", icon: CheckCircle2 },
  received_fee: { color: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "固费入账", icon: DollarSign },
  received_commission: { color: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "佣金入账", icon: TrendingUp },
};

export function ChannelReconciliationDetail({
  record,
  derivedPeriods,
  isAdmin: _isAdmin,
  isStaff,
  canEdit,
}: {
  record: DetailRecord;
  derivedPeriods: PeriodDerived[];
  isAdmin: boolean;
  isStaff: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const waterfall = buildWaterfall(derivedPeriods);

  // 汇总：按 Thraive 实际收款汇总 → 渠道商待收
  const summary = derivedPeriods.reduce(
    (acc, p) => {
      if (p.feeReceivedAt && p.channelReceivableFee !== null) acc.feeTotal += p.channelReceivableFee;
      if (p.commissionReceivedAt && p.channelReceivableCommission !== null) acc.commissionTotal += p.channelReceivableCommission;
      return acc;
    },
    { feeTotal: 0, commissionTotal: 0 }
  );

  // Adapter for the existing modal
  const editRecord: ChannelReconciliationRecord = {
    ...record,
    periods: record.periods.map((p): CRPeriod => ({
      id: p.id,
      periodIndex: p.periodIndex,
      periodLabel: p.periodLabel,
      fixedFeeAmount: p.fixedFeeAmount,
      commissionAmount: p.commissionAmount,
      fixedFeePaidAt: p.fixedFeePaidAt,
      commissionPaidAt: p.commissionPaidAt,
      proofUrl: p.proofUrl,
      notes: p.notes,
    })),
  };

  const tieredRules: { gmvMin: number; gmvMax: number | null; rate: number }[] = (() => {
    if (!record.splitRule) return [];
    try {
      const parsed = JSON.parse(record.splitRule.tieredRules);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance?tab=channels" className="btn-secondary text-sm">
            <ArrowLeft className="h-4 w-4" /> 返回渠道商对账
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">渠道商分账详情</h1>
            <p className="mt-1 text-sm text-slate-500">
              <Link href={`/customers/${record.customer.id}`} className="text-brand-600 hover:underline">
                {record.customer.brandName}
              </Link>
              {" · "}合同 {record.contract?.contractNo ?? "—"} · 渠道商 {record.channelUser.name}
            </p>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => setEditing(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Settings className="h-4 w-4" /> 编辑/管理分账
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <DollarSign className="h-4 w-4" /> 固费分账总额（按 Thraive 实际收款汇总）
          </div>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{fmtMoney(summary.feeTotal)}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            分账比例 {fmtPct(record.splitRule?.fixedFeeRate ?? record.fixedFeeShareRate)}
          </p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <TrendingUp className="h-4 w-4" /> 佣金分账总额（按 Thraive 实际收款汇总）
          </div>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{fmtMoney(summary.commissionTotal)}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {record.splitRule?.ruleType === "B"
              ? `B 阶梯（${tieredRules.length} 档）`
              : `A 单一比例 ${fmtPct(record.splitRule?.commissionRate ?? record.commissionShareRate)}`}
          </p>
        </div>
      </div>

      {/* Rule snapshot */}
      {record.splitRule && (
        <div className="card p-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">分账规则</p>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-slate-400">类型</p>
              <p className="font-medium text-slate-800">{record.splitRule.ruleType === "A" ? "A 基础" : "B 阶梯"}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">截止日期</p>
              <p className="font-medium text-slate-800">{formatDate(new Date(record.splitRule.splitEndDate))}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">固费分账比例</p>
              <p className="font-medium text-slate-800">{fmtPct(record.splitRule.fixedFeeRate)}</p>
            </div>
          </div>
          {record.splitRule.ruleType === "B" && tieredRules.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left">GMV 下界</th>
                    <th className="px-3 py-1.5 text-left">GMV 上界</th>
                    <th className="px-3 py-1.5 text-right">比例</th>
                  </tr>
                </thead>
                <tbody>
                  {tieredRules.map((t, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{fmtMoney(t.gmvMin)}</td>
                      <td className="px-3 py-1.5">{t.gmvMax === null ? "+∞" : fmtMoney(t.gmvMax)}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{fmtPct(t.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Periods table — 7 columns */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">期数明细 ({derivedPeriods.length})</p>
          <p className="text-[11px] text-slate-400">"—"表示该月客户对账尚未确认</p>
        </div>
        {derivedPeriods.length === 0 ? (
          <p className="text-xs text-slate-400">暂无期数（未配置分账规则时不会自动生成期数）</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left">期</th>
                  <th className="px-2 py-2 text-left">月份</th>
                  <th className="px-2 py-2 text-right">确认固费金额</th>
                  <th className="px-2 py-2 text-right">固费分账比例</th>
                  <th className="px-2 py-2 text-right">渠道商待收固费</th>
                  <th className="px-2 py-2 text-right">已对账GMV</th>
                  <th className="px-2 py-2 text-right">已对账GMV佣金</th>
                  <th className="px-2 py-2 text-right">分账佣金比例</th>
                  <th className="px-2 py-2 text-right">渠道商待收佣金</th>
                  <th className="px-2 py-2 text-left">付款截止</th>
                </tr>
              </thead>
              <tbody>
                {derivedPeriods.map((p) => (
                  <tr key={p.periodIndex} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-2 py-2 text-slate-600">{p.periodIndex}</td>
                    <td className="px-2 py-2 text-slate-600">{p.monthLabel}</td>
                    <td className="px-2 py-2 text-right font-medium text-slate-800">{fmtMoney(p.confirmedFee)}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{fmtPct(p.fixedFeeRate)}</td>
                    <td className="px-2 py-2 text-right font-semibold text-emerald-600">{fmtMoney(p.channelReceivableFee)}</td>
                    <td className="px-2 py-2 text-right text-slate-600">{fmtMoney(p.confirmedGmv)}</td>
                    <td className="px-2 py-2 text-right font-medium text-slate-800">{fmtMoney(p.confirmedCommission)}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{fmtPct(p.channelCommissionRate)}</td>
                    <td className="px-2 py-2 text-right font-semibold text-emerald-600">{fmtMoney(p.channelReceivableCommission)}</td>
                    <td className="px-2 py-2 text-slate-600">
                      {p.dueDate ? (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">
                          <Clock className="h-3 w-3" /> {formatDate(new Date(p.dueDate))}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Waterfall timeline */}
      <div className="card p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">时间流瀑布（仅显示对账确认 & Thraive 实际收款）</p>
        {waterfall.length === 0 ? (
          <p className="text-xs text-slate-400">暂无事件 — 等客户对账确认或 Thraive 实际收款后此处会自动填充</p>
        ) : (
          <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
            {waterfall.map((e, i) => {
              const cfg = KIND_BADGE[e.kind];
              const Icon = cfg.icon;
              return (
                <li key={i} className="relative">
                  <div className={`absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full border-2 ${cfg.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                          <span className="text-sm font-semibold text-slate-800">{e.title}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{e.amount}</p>
                        {e.dueDate && (
                          <p className="mt-1 inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">
                            <Calendar className="h-3 w-3" /> 渠道商付款截止：{formatDate(new Date(e.dueDate))}（实收+7工作日）
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-[11px] text-slate-400">{formatDate(new Date(e.at))}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {editing && canEdit && (
        <ChannelReconciliationDetailModal
          record={editRecord}
          derivedPeriods={derivedPeriods}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
