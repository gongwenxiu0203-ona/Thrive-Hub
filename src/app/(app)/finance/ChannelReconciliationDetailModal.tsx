"use client";

import { useState } from "react";
import { Send, Settings, Calendar, CheckCircle2, Clock } from "lucide-react";
import { FEE_CURRENCY_OPTIONS } from "@/lib/constants";
import { toInputDate, formatDate } from "@/lib/utils";
import type { PeriodDerived } from "@/lib/channelSplit";
import { Modal } from "@/components/ui/Modal";

export type CRPeriod = {
  id: string;
  periodIndex: number;
  periodLabel: string | null;
  fixedFeeAmount: number | null;
  commissionAmount: number | null;
  fixedFeePaidAt: Date | string | null;
  commissionPaidAt: Date | string | null;
  proofUrl: string | null;
  notes: string | null;
};

export type ChannelReconciliationRecord = {
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
  // legacy fields
  periodNo: number;
  periodStart: Date | string | null;
  periodEnd: Date | string | null;
  fixedFeeReceived: number | null;
  fixedFeeShareAmount: number;
  fixedFeeShareCurrency: string;
  fixedFeeEstimatedDate: Date | string | null;
  fixedFeeActualDate: Date | string | null;
  fixedFeeProofUrl: string | null;
  fixedFeePushedToChannel: boolean;
  commissionReceived: number | null;
  commissionShareAmount: number;
  commissionShareCurrency: string;
  commissionEstimatedDate: Date | string | null;
  commissionActualDate: Date | string | null;
  commissionProofUrl: string | null;
  commissionPushedToChannel: boolean;
  periods: CRPeriod[];
};

export function ChannelReconciliationDetailModal({
  record,
  derivedPeriods,
  onClose,
  onSaved,
}: {
  record: ChannelReconciliationRecord;
  derivedPeriods?: PeriodDerived[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [view, setView] = useState<"setup" | "periods">(
    record.periods.length > 0 ? "periods" : "setup"
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`渠道分账详情 — ${record.customer.brandName}`}
      description={`合同 ${record.contract?.contractNo ?? "—"} · 渠道商 ${record.channelUser.name}`}
      size="lg"
      footer={<button onClick={onClose} className="btn-secondary">关闭</button>}
    >
      <div className="flex min-h-0 flex-col">
        <div className="mb-5 shrink-0">
          <div className="flex items-start justify-end">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              <button
                onClick={() => setView("setup")}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === "setup" ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Settings className="h-3 w-3" />分账设置
              </button>
              <button
                onClick={() => setView("periods")}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === "periods" ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Calendar className="h-3 w-3" />期数管理
                {record.periods.length > 0 && (
                  <span className="ml-1 rounded-full bg-brand-100 px-1.5 text-[10px] text-brand-700">
                    {record.periods.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1">
          {view === "setup" ? (
            <SetupView record={record} onSaved={onSaved} />
          ) : (
            <PeriodsView record={record} derivedPeriods={derivedPeriods} onSaved={onSaved} />
          )}
        </div>

      </div>
    </Modal>
  );
}

// ── 新版：分账配置视图 ────────────────────────────────────────────────────────
function SetupView({
  record,
  onSaved,
}: {
  record: ChannelReconciliationRecord;
  onSaved: () => void;
}) {
  const [totalPeriods, setTotalPeriods] = useState(String(record.totalPeriods ?? ""));
  const [periodType, setPeriodType] = useState(record.periodType ?? "monthly");
  const [fixedFeeTotal, setFixedFeeTotal] = useState(record.fixedFeeTotal != null ? String(record.fixedFeeTotal) : "");
  const [commissionTotal, setCommissionTotal] = useState(record.commissionTotal != null ? String(record.commissionTotal) : "");
  const [fixedFeeRate, setFixedFeeRate] = useState(
    record.fixedFeeShareRate ? `${(record.fixedFeeShareRate * 100).toFixed(2)}%` : ""
  );
  const [commissionRate, setCommissionRate] = useState(
    record.commissionShareRate ? `${(record.commissionShareRate * 100).toFixed(2)}%` : ""
  );
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  function parsePct(s: string): number {
    if (!s) return 0;
    const n = Number(s.replace(/[%\s]/g, ""));
    return !Number.isFinite(n) ? 0 : n > 1 ? n / 100 : n;
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/channel-reconciliations/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalPeriods: totalPeriods ? Number(totalPeriods) : null,
          periodType,
          fixedFeeTotal: fixedFeeTotal ? Number(fixedFeeTotal) : null,
          commissionTotal: commissionTotal ? Number(commissionTotal) : null,
          fixedFeeShareRate: parsePct(fixedFeeRate),
          commissionShareRate: parsePct(commissionRate),
        }),
      });
      if (!res.ok) { alert((await res.json()).error ?? "保存失败"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  async function generatePeriods() {
    if (!totalPeriods || Number(totalPeriods) < 1) {
      alert("请先填写期数");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/finance/channel-reconciliations/${record.id}/generate-periods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalPeriods: Number(totalPeriods),
          periodType,
          fixedFeeTotal: fixedFeeTotal ? Number(fixedFeeTotal) : null,
          commissionTotal: commissionTotal ? Number(commissionTotal) : null,
          fixedFeeShareRate: parsePct(fixedFeeRate),
          commissionShareRate: parsePct(commissionRate),
        }),
      });
      if (!res.ok) { alert((await res.json()).error ?? "生成失败"); return; }
      onSaved();
    } finally { setGenerating(false); }
  }

  const perFixed = fixedFeeTotal && totalPeriods
    ? (Number(fixedFeeTotal) / Number(totalPeriods)).toFixed(2) : null;
  const perComm = commissionTotal && totalPeriods
    ? (Number(commissionTotal) / Number(totalPeriods)).toFixed(2) : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label text-xs">分账期数 *</label>
          <input type="number" min={1} max={120} className="input"
            placeholder="如 12（月度）或 4（季度）"
            value={totalPeriods} onChange={e => setTotalPeriods(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">分账周期类型 *</label>
          <select className="input" value={periodType} onChange={e => setPeriodType(e.target.value)}>
            <option value="monthly">月度</option>
            <option value="quarterly">季度</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">固费总金额</label>
          <input type="number" step="0.01" className="input" placeholder="合同固费总额"
            value={fixedFeeTotal} onChange={e => setFixedFeeTotal(e.target.value)} />
          {perFixed && (
            <p className="mt-1 text-[11px] text-slate-400">每期约 ¥{perFixed}</p>
          )}
        </div>
        <div>
          <label className="label text-xs">固费分账比例</label>
          <input className="input" placeholder="如 30%"
            value={fixedFeeRate} onChange={e => setFixedFeeRate(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">佣金总金额</label>
          <input type="number" step="0.01" className="input" placeholder="合同佣金总额"
            value={commissionTotal} onChange={e => setCommissionTotal(e.target.value)} />
          {perComm && (
            <p className="mt-1 text-[11px] text-slate-400">每期约 ¥{perComm}</p>
          )}
        </div>
        <div>
          <label className="label text-xs">佣金分账比例</label>
          <input className="input" placeholder="如 30%"
            value={commissionRate} onChange={e => setCommissionRate(e.target.value)} />
        </div>
      </div>

      {record.periods.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-700">
          ⚠️ 重新生成期数将覆盖现有 {record.periods.length} 条期数记录（已付款的期数数据也会丢失）
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={saveConfig} disabled={saving}
          className="btn-secondary text-sm">
          {saving ? "保存中…" : "仅保存配置"}
        </button>
        <button type="button" onClick={generatePeriods} disabled={generating || !totalPeriods}
          className="btn-primary text-sm">
          {generating ? "生成中…" : record.periods.length > 0 ? "重新生成期数" : "生成分账期数"}
        </button>
      </div>
    </div>
  );
}

// ── 新版：期数管理视图 ────────────────────────────────────────────────────────
function fmtMoneyDM(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `¥${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function fmtPctDM(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function PeriodsView({
  record,
  derivedPeriods,
  onSaved,
}: {
  record: ChannelReconciliationRecord;
  derivedPeriods?: PeriodDerived[];
  onSaved: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const hasFixed = record.fixedFeeTotal != null && record.fixedFeeTotal > 0;
  const hasComm  = record.commissionTotal != null && record.commissionTotal > 0;

  if (record.periods.length === 0) {
    return (
      <div className="py-10 text-center text-slate-400">
        <p className="mb-2 text-sm">尚未生成分账期数</p>
        <p className="text-xs">请先在「分账设置」页配置并生成期数</p>
      </div>
    );
  }

  const paidFixed = record.periods.filter(p => p.fixedFeePaidAt).length;
  const paidComm  = record.periods.filter(p => p.commissionPaidAt).length;

  return (
    <div className="space-y-3">
      {/* 进度摘要 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="总期数" value={`${record.periods.length} 期`} />
        <Stat label="周期类型" value={record.periodType === "quarterly" ? "季度" : "月度"} />
        {hasFixed && <Stat label="固费已付" value={`${paidFixed}/${record.periods.length}`}
          accent={paidFixed === record.periods.length ? "text-emerald-700" : "text-amber-700"} />}
        {hasComm && <Stat label="佣金已付" value={`${paidComm}/${record.periods.length}`}
          accent={paidComm === record.periods.length ? "text-emerald-700" : "text-amber-700"} />}
      </div>

      {/* 自动派生：7 列只读表（从客户对账与 Thraive 实际收款抽取） */}
      {derivedPeriods && derivedPeriods.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">
            分账明细（自动派生，来源：客户对账 + Thraive 实际收款）
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-1.5 py-1 text-left">期</th>
                  <th className="px-1.5 py-1 text-left">月份</th>
                  <th className="px-1.5 py-1 text-right">确认固费</th>
                  <th className="px-1.5 py-1 text-right">固费比例</th>
                  <th className="px-1.5 py-1 text-right">待收固费</th>
                  <th className="px-1.5 py-1 text-right">已对账GMV</th>
                  <th className="px-1.5 py-1 text-right">GMV佣金</th>
                  <th className="px-1.5 py-1 text-right">佣金比例</th>
                  <th className="px-1.5 py-1 text-right">待收佣金</th>
                  <th className="px-1.5 py-1 text-left">付款截止</th>
                </tr>
              </thead>
              <tbody>
                {derivedPeriods.map((p) => (
                  <tr key={p.periodIndex} className="border-t border-slate-200">
                    <td className="px-1.5 py-1">{p.periodIndex}</td>
                    <td className="px-1.5 py-1">{p.monthLabel}</td>
                    <td className="px-1.5 py-1 text-right">{fmtMoneyDM(p.confirmedFee)}</td>
                    <td className="px-1.5 py-1 text-right text-slate-500">{fmtPctDM(p.fixedFeeRate)}</td>
                    <td className="px-1.5 py-1 text-right font-semibold text-emerald-700">{fmtMoneyDM(p.channelReceivableFee)}</td>
                    <td className="px-1.5 py-1 text-right">{fmtMoneyDM(p.confirmedGmv)}</td>
                    <td className="px-1.5 py-1 text-right">{fmtMoneyDM(p.confirmedCommission)}</td>
                    <td className="px-1.5 py-1 text-right text-slate-500">{fmtPctDM(p.channelCommissionRate)}</td>
                    <td className="px-1.5 py-1 text-right font-semibold text-emerald-700">{fmtMoneyDM(p.channelReceivableCommission)}</td>
                    <td className="px-1.5 py-1">
                      {p.dueDate ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-700">
                          <Clock className="h-2.5 w-2.5" />{formatDate(new Date(p.dueDate))}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 期数列表 */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {record.periods.map(p => (
          <PeriodRow
            key={p.id}
            period={p}
            reconciliationId={record.id}
            hasFixed={hasFixed}
            hasComm={hasComm}
            expanded={expandedId === p.id}
            onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
            onSaved={onSaved}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "text-slate-800" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-sm font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function PeriodRow({
  period,
  reconciliationId,
  hasFixed,
  hasComm,
  expanded,
  onToggle,
  onSaved,
}: {
  period: CRPeriod;
  reconciliationId: string;
  hasFixed: boolean;
  hasComm: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const [fixedPaidAt, setFixedPaidAt] = useState(toInputDate(period.fixedFeePaidAt));
  const [commPaidAt, setCommPaidAt]   = useState(toInputDate(period.commissionPaidAt));
  const [fixedAmt, setFixedAmt]       = useState(period.fixedFeeAmount != null ? String(period.fixedFeeAmount) : "");
  const [commAmt, setCommAmt]         = useState(period.commissionAmount != null ? String(period.commissionAmount) : "");
  const [notes, setNotes]             = useState(period.notes ?? "");
  const [saving, setSaving]           = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/finance/channel-reconciliations/${reconciliationId}/periods/${period.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fixedFeeAmount: fixedAmt ? Number(fixedAmt) : null,
            commissionAmount: commAmt ? Number(commAmt) : null,
            fixedFeePaidAt: fixedPaidAt || null,
            commissionPaidAt: commPaidAt || null,
            notes: notes || null,
          }),
        }
      );
      if (!res.ok) { alert((await res.json()).error ?? "保存失败"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  const fixedDone = !!period.fixedFeePaidAt;
  const commDone  = !!period.commissionPaidAt;
  const allDone   = (!hasFixed || fixedDone) && (!hasComm || commDone);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold
          ${allDone ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {allDone ? <CheckCircle2 className="h-4 w-4" /> : period.periodIndex}
        </span>
        <span className="flex-1 text-sm font-medium text-slate-700">
          {period.periodLabel ?? `第${period.periodIndex}期`}
        </span>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {hasFixed && (
            <span className={fixedDone ? "text-emerald-600" : "text-amber-600"}>
              固费 {fixedDone ? `✓ ${formatDate(period.fixedFeePaidAt)}` : "待付"}
            </span>
          )}
          {hasComm && (
            <span className={commDone ? "text-emerald-600" : "text-amber-600"}>
              佣金 {commDone ? `✓ ${formatDate(period.commissionPaidAt)}` : "待付"}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/60">
          <div className="grid gap-3 sm:grid-cols-2">
            {hasFixed && (
              <>
                <div>
                  <label className="label text-xs">固费金额</label>
                  <input type="number" step="0.01" className="input" placeholder="本期固费"
                    value={fixedAmt} onChange={e => setFixedAmt(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">固费付款日期</label>
                  <input type="date" className="input"
                    value={fixedPaidAt} onChange={e => setFixedPaidAt(e.target.value)} />
                </div>
              </>
            )}
            {hasComm && (
              <>
                <div>
                  <label className="label text-xs">佣金金额</label>
                  <input type="number" step="0.01" className="input" placeholder="本期佣金"
                    value={commAmt} onChange={e => setCommAmt(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">佣金付款日期</label>
                  <input type="date" className="input"
                    value={commPaidAt} onChange={e => setCommPaidAt(e.target.value)} />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className="label text-xs">备注</label>
              <input className="input" placeholder="可选备注"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={save} disabled={saving}
              className="btn-primary text-sm">
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 旧版：固费/抽佣卡片视图 ────────────────────────────────────────────────────
function LegacyView({
  record,
  onSaved,
}: {
  record: ChannelReconciliationRecord;
  onSaved: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">第 {record.periodNo} 期
        {record.periodStart && record.periodEnd && (
          <span> · {formatDate(record.periodStart)} ~ {formatDate(record.periodEnd)}</span>
        )}
      </p>
      <SideCard side="FIXED_FEE" label="固费分账" tone="emerald" record={record} onSaved={onSaved} />
      <SideCard side="COMMISSION" label="抽佣分账" tone="amber" record={record} onSaved={onSaved} />
    </div>
  );
}

// ── 旧版侧卡 ────────────────────────────────────────────────────────────────
function SideCard({
  side, label, tone, record, onSaved,
}: {
  side: "FIXED_FEE" | "COMMISSION";
  label: string;
  tone: "emerald" | "amber";
  record: ChannelReconciliationRecord;
  onSaved: () => void;
}) {
  const isFixed = side === "FIXED_FEE";
  const received   = isFixed ? record.fixedFeeReceived   : record.commissionReceived;
  const rate       = isFixed ? record.fixedFeeShareRate   : record.commissionShareRate;
  const amount     = isFixed ? record.fixedFeeShareAmount : record.commissionShareAmount;
  const currency   = isFixed ? record.fixedFeeShareCurrency : record.commissionShareCurrency;
  const estDate    = isFixed ? record.fixedFeeEstimatedDate : record.commissionEstimatedDate;
  const actDate    = isFixed ? record.fixedFeeActualDate    : record.commissionActualDate;
  const proofUrl   = isFixed ? record.fixedFeeProofUrl      : record.commissionProofUrl;
  const pushed     = isFixed ? record.fixedFeePushedToChannel : record.commissionPushedToChannel;

  const [receivedInput, setReceivedInput] = useState(received != null ? String(received) : "");
  const [rateInput, setRateInput]         = useState(rate ? `${(rate * 100).toFixed(2)}%` : "");
  const [currencyInput, setCurrencyInput] = useState(currency);
  const [estInput, setEstInput]           = useState(toInputDate(estDate));
  const [actInput, setActInput]           = useState(toInputDate(actDate));
  const [proofInput, setProofInput]       = useState(proofUrl ?? "");
  const [saving, setSaving]   = useState(false);
  const [pushing, setPushing] = useState(false);

  function parsePct(s: string): number {
    if (!s) return 0;
    const n = Number(s.replace(/[%\s]/g, ""));
    return !Number.isFinite(n) ? 0 : n > 1 ? n / 100 : n;
  }

  async function save() {
    setSaving(true);
    try {
      const recvNum = receivedInput ? Number(receivedInput) : null;
      const rateNum = parsePct(rateInput);
      const body = isFixed
        ? { fixedFeeReceived: recvNum, fixedFeeShareRate: rateNum, fixedFeeShareCurrency: currencyInput,
            fixedFeeEstimatedDate: estInput || null, fixedFeeActualDate: actInput || null, fixedFeeProofUrl: proofInput || null }
        : { commissionReceived: recvNum, commissionShareRate: rateNum, commissionShareCurrency: currencyInput,
            commissionEstimatedDate: estInput || null, commissionActualDate: actInput || null, commissionProofUrl: proofInput || null };
      const res = await fetch(`/api/finance/channel-reconciliations/${record.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { alert((await res.json()).error ?? "保存失败"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  async function push() {
    setPushing(true);
    try {
      const res = await fetch(`/api/finance/channel-reconciliations/${record.id}/push`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side }),
      });
      if (!res.ok) { alert((await res.json()).error ?? "推送失败"); return; }
      onSaved();
    } finally { setPushing(false); }
  }

  const sym = currencyInput === "美金" ? "$" : "¥";
  const previewAmount = receivedInput && rateInput ? Number(receivedInput) * parsePct(rateInput) : 0;
  const accent = tone === "emerald" ? "border-l-emerald-400 bg-emerald-50/40" : "border-l-amber-400 bg-amber-50/40";

  return (
    <div className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 ${accent}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
        {pushed && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">已推送渠道商</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label text-xs">{isFixed ? "到账固费金额" : "到账抽佣金额"}</label>
          <input type="number" className="input" placeholder="实际结算后填写"
            value={receivedInput} onChange={e => setReceivedInput(e.target.value)} step="0.01" />
        </div>
        <div>
          <label className="label text-xs">分账比例</label>
          <input className="input" placeholder="如 30%"
            value={rateInput} onChange={e => setRateInput(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">分账金额（自动）</label>
          <input className="input bg-slate-50" readOnly
            value={previewAmount > 0
              ? `${sym}${previewAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
              : amount > 0 ? `${sym}${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : "—"} />
        </div>
        <div>
          <label className="label text-xs">货币</label>
          <select className="input" value={currencyInput} onChange={e => setCurrencyInput(e.target.value)}>
            {FEE_CURRENCY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">预计结算时间</label>
          <input type="date" className="input" value={estInput} onChange={e => setEstInput(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">实际结算时间</label>
          <input type="date" className="input" value={actInput} onChange={e => setActInput(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <label className="label text-xs">转账截图 URL</label>
          <input type="url" className="input" placeholder="粘贴转账凭证图片链接"
            value={proofInput} onChange={e => setProofInput(e.target.value)} />
          {proofInput && (
            <a href={proofInput} target="_blank" rel="noreferrer"
              className="mt-1 inline-block text-xs text-brand-600 hover:underline">查看附件 ↗</a>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={saving} onClick={save}>
          {saving ? "保存中…" : "保存"}
        </button>
        <button type="button"
          className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          disabled={pushing || !actDate} title={!actDate ? "需先填写实际结算时间" : "推送给渠道商"} onClick={push}>
          <Send className="h-3.5 w-3.5" />
          {pushing ? "推送中…" : pushed ? "再次推送" : "推送给渠道商"}
        </button>
      </div>
    </div>
  );
}
