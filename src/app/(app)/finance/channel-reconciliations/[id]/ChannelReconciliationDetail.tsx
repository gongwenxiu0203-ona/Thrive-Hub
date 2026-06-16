"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Settings, Calendar, CheckCircle2, FileText, DollarSign, Percent, TrendingUp,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
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

export interface CustomerRecRow {
  id: string;
  periodLabel: string;
  status: string;
  feeAmount: number;
  commissionAmount: number;
  createdAt: string;
  submittedAt: string | null;
}

type TimelineEvent = {
  at: string;
  kind: "customer_rec_created" | "customer_rec_submitted" | "customer_rec_confirmed"
       | "fixed_fee_estimated" | "fixed_fee_actual"
       | "commission_estimated" | "commission_actual";
  label: string;
  meta?: string;
};

function buildTimeline(record: DetailRecord, customerRecs: CustomerRecRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const c of customerRecs) {
    events.push({
      at: c.createdAt,
      kind: "customer_rec_created",
      label: `客户对账 ${c.periodLabel} 创建`,
      meta: `固费 ¥${c.feeAmount.toLocaleString()} · 佣金 ¥${c.commissionAmount.toLocaleString()}`,
    });
    if (c.submittedAt) {
      events.push({
        at: c.submittedAt,
        kind: "customer_rec_submitted",
        label: `客户对账 ${c.periodLabel} 已提交审核`,
      });
    }
    if (c.status === "CONFIRMED") {
      // Approximation: no explicit confirmedAt — use submittedAt as proxy if present
      const at = c.submittedAt ?? c.createdAt;
      events.push({
        at,
        kind: "customer_rec_confirmed",
        label: `客户对账 ${c.periodLabel} 终版确认`,
      });
    }
  }

  if (record.fixedFeeEstimatedDate) {
    events.push({
      at: record.fixedFeeEstimatedDate,
      kind: "fixed_fee_estimated",
      label: "固费应收日",
      meta: `应收 ${record.fixedFeeShareCurrency} ${record.fixedFeeShareAmount.toLocaleString()}`,
    });
  }
  if (record.fixedFeeActualDate) {
    events.push({
      at: record.fixedFeeActualDate,
      kind: "fixed_fee_actual",
      label: "固费实际入账",
      meta: `${record.fixedFeeShareCurrency} ${record.fixedFeeShareAmount.toLocaleString()}`,
    });
  }
  if (record.commissionEstimatedDate) {
    events.push({
      at: record.commissionEstimatedDate,
      kind: "commission_estimated",
      label: "佣金应收日",
      meta: `应收 ${record.commissionShareCurrency} ${record.commissionShareAmount.toLocaleString()}`,
    });
  }
  if (record.commissionActualDate) {
    events.push({
      at: record.commissionActualDate,
      kind: "commission_actual",
      label: "佣金实际入账",
      meta: `${record.commissionShareCurrency} ${record.commissionShareAmount.toLocaleString()}`,
    });
  }

  for (const p of record.periods) {
    if (p.fixedFeePaidAt) {
      events.push({
        at: p.fixedFeePaidAt,
        kind: "fixed_fee_actual",
        label: `第 ${p.periodIndex} 期 固费已收`,
        meta: p.fixedFeeAmount !== null ? `¥${p.fixedFeeAmount.toLocaleString()}` : undefined,
      });
    }
    if (p.commissionPaidAt) {
      events.push({
        at: p.commissionPaidAt,
        kind: "commission_actual",
        label: `第 ${p.periodIndex} 期 佣金已收`,
        meta: p.commissionAmount !== null ? `¥${p.commissionAmount.toLocaleString()}` : undefined,
      });
    }
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function calcSummary(record: DetailRecord) {
  // 按渠道商实际收款汇总（only count rows where actual date is filled）
  let fixedTotal = 0;
  let commissionTotal = 0;

  if (record.periods.length > 0) {
    for (const p of record.periods) {
      if (p.fixedFeePaidAt && p.fixedFeeAmount !== null) fixedTotal += p.fixedFeeAmount;
      if (p.commissionPaidAt && p.commissionAmount !== null) commissionTotal += p.commissionAmount;
    }
  } else {
    if (record.fixedFeeActualDate) fixedTotal += record.fixedFeeShareAmount;
    if (record.commissionActualDate) commissionTotal += record.commissionShareAmount;
  }

  return { fixedTotal, commissionTotal };
}

const KIND_STYLE: Record<TimelineEvent["kind"], { color: string; icon: typeof CheckCircle2 }> = {
  customer_rec_created: { color: "bg-slate-200 text-slate-600", icon: FileText },
  customer_rec_submitted: { color: "bg-amber-100 text-amber-700", icon: FileText },
  customer_rec_confirmed: { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  fixed_fee_estimated: { color: "bg-blue-100 text-blue-700", icon: Calendar },
  fixed_fee_actual: { color: "bg-emerald-100 text-emerald-700", icon: DollarSign },
  commission_estimated: { color: "bg-blue-100 text-blue-700", icon: Calendar },
  commission_actual: { color: "bg-emerald-100 text-emerald-700", icon: Percent },
};

export function ChannelReconciliationDetail({
  record,
  customerRecs,
  isAdmin: _isAdmin,
  isStaff,
}: {
  record: DetailRecord;
  customerRecs: CustomerRecRow[];
  isAdmin: boolean;
  isStaff: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const timeline = buildTimeline(record, customerRecs);
  const summary = calcSummary(record);

  // Adapter for the existing modal (it expects Date | string types)
  const editRecord: ChannelReconciliationRecord = {
    ...record,
    customer: record.customer,
    contract: record.contract,
    channelUser: record.channelUser,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    fixedFeeEstimatedDate: record.fixedFeeEstimatedDate,
    fixedFeeActualDate: record.fixedFeeActualDate,
    commissionEstimatedDate: record.commissionEstimatedDate,
    commissionActualDate: record.commissionActualDate,
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

  const tieredRules = (() => {
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
        {isStaff && (
          <button onClick={() => setEditing(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Settings className="h-4 w-4" /> 编辑/管理分账
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <DollarSign className="h-4 w-4" /> 固费分账总额（按实际收款）
          </div>
          <p className="mt-2 text-3xl font-bold text-emerald-600">
            ¥{summary.fixedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            分账比例 {(record.fixedFeeShareRate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <TrendingUp className="h-4 w-4" /> 佣金分账总额（按实际收款）
          </div>
          <p className="mt-2 text-3xl font-bold text-emerald-600">
            ¥{summary.commissionTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {record.splitRule?.ruleType === "B"
              ? `B 阶梯（${tieredRules.length} 档）`
              : `A 单一比例 ${(record.commissionShareRate * 100).toFixed(1)}%`}
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
              <p className="font-medium text-slate-800">{(record.splitRule.fixedFeeRate * 100).toFixed(1)}%</p>
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
                  {tieredRules.map((t: { gmvMin: number; gmvMax: number | null; rate: number }, i: number) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">¥{t.gmvMin.toLocaleString()}</td>
                      <td className="px-3 py-1.5">{t.gmvMax === null ? "+∞" : `¥${t.gmvMax.toLocaleString()}`}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{(t.rate * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Periods table */}
        <div className="card p-5">
          <p className="mb-3 text-sm font-semibold text-slate-700">期数明细 ({record.periods.length})</p>
          {record.periods.length === 0 ? (
            <p className="text-xs text-slate-400">暂无期数（未配置分账规则时不会自动生成期数）</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left">期</th>
                    <th className="px-2 py-1.5 text-left">月份</th>
                    <th className="px-2 py-1.5 text-right">固费</th>
                    <th className="px-2 py-1.5 text-right">佣金</th>
                    <th className="px-2 py-1.5 text-left">收款</th>
                  </tr>
                </thead>
                <tbody>
                  {record.periods.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{p.periodIndex}</td>
                      <td className="px-2 py-1.5">{p.periodLabel ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right">{p.fixedFeeAmount !== null ? `¥${p.fixedFeeAmount.toLocaleString()}` : "—"}</td>
                      <td className="px-2 py-1.5 text-right">{p.commissionAmount !== null ? `¥${p.commissionAmount.toLocaleString()}` : "—"}</td>
                      <td className="px-2 py-1.5">
                        {p.fixedFeePaidAt ? <span className="text-emerald-600">✓固费</span> : <span className="text-slate-300">○固费</span>}
                        {" "}
                        {p.commissionPaidAt ? <span className="text-emerald-600">✓佣金</span> : <span className="text-slate-300">○佣金</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="card p-5">
          <p className="mb-3 text-sm font-semibold text-slate-700">时间流（对账 + 收费进度）</p>
          {timeline.length === 0 ? (
            <p className="text-xs text-slate-400">暂无事件</p>
          ) : (
            <ul className="space-y-3">
              {timeline.slice(0, 20).map((e, i) => {
                const cfg = KIND_STYLE[e.kind];
                const Icon = cfg.icon;
                return (
                  <li key={i} className="flex items-start gap-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cfg.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{e.label}</p>
                      {e.meta && <p className="text-[11px] text-slate-400">{e.meta}</p>}
                      <p className="mt-0.5 text-[10px] text-slate-400">{formatDate(new Date(e.at))}</p>
                    </div>
                  </li>
                );
              })}
              {timeline.length > 20 && (
                <li className="text-center text-[11px] text-slate-400">显示最近 20 条 / 共 {timeline.length} 条</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {editing && (
        <ChannelReconciliationDetailModal
          record={editRecord}
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
