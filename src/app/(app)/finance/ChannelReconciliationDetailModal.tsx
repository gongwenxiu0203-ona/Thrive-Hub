"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { FEE_CURRENCY_OPTIONS } from "@/lib/constants";
import { toInputDate } from "@/lib/utils";

type Record = {
  id: string;
  customer: { id: string; brandName: string };
  contract: { id: string; contractNo: string } | null;
  channelUser: { id: string; name: string };
  periodNo: number;
  periodStart: Date | string | null;
  periodEnd: Date | string | null;
  // 固费
  fixedFeeReceived: number | null;
  fixedFeeShareRate: number;
  fixedFeeShareAmount: number;
  fixedFeeShareCurrency: string;
  fixedFeeEstimatedDate: Date | string | null;
  fixedFeeActualDate: Date | string | null;
  fixedFeeProofUrl: string | null;
  fixedFeePushedToChannel: boolean;
  // 抽佣
  commissionReceived: number | null;
  commissionShareRate: number;
  commissionShareAmount: number;
  commissionShareCurrency: string;
  commissionEstimatedDate: Date | string | null;
  commissionActualDate: Date | string | null;
  commissionProofUrl: string | null;
  commissionPushedToChannel: boolean;
};

export function ChannelReconciliationDetailModal({
  record,
  onClose,
  onSaved,
}: {
  record: Record;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            渠道分账详情 — {record.customer.brandName}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            合同 {record.contract?.contractNo ?? "—"} ·  渠道商{" "}
            {record.channelUser.name} ·  第 {record.periodNo} 期
          </p>
        </div>

        <div className="max-h-[80vh] space-y-4 overflow-y-auto px-6 py-5">
          <SideCard
            side="FIXED_FEE"
            label="固费分账"
            tone="emerald"
            record={record}
            onSaved={onSaved}
          />
          <SideCard
            side="COMMISSION"
            label="抽佣分账"
            tone="amber"
            record={record}
            onSaved={onSaved}
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-3">
          <button onClick={onClose} className="btn-secondary">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 一侧（固费/抽佣）独立卡片 ────────────────────────────────────────────────
function SideCard({
  side,
  label,
  tone,
  record,
  onSaved,
}: {
  side: "FIXED_FEE" | "COMMISSION";
  label: string;
  tone: "emerald" | "amber";
  record: Record;
  onSaved: () => void;
}) {
  const isFixed = side === "FIXED_FEE";

  const received = isFixed ? record.fixedFeeReceived : record.commissionReceived;
  const rate = isFixed ? record.fixedFeeShareRate : record.commissionShareRate;
  const amount = isFixed
    ? record.fixedFeeShareAmount
    : record.commissionShareAmount;
  const currency = isFixed
    ? record.fixedFeeShareCurrency
    : record.commissionShareCurrency;
  const estDate = isFixed
    ? record.fixedFeeEstimatedDate
    : record.commissionEstimatedDate;
  const actDate = isFixed
    ? record.fixedFeeActualDate
    : record.commissionActualDate;
  const proofUrl = isFixed ? record.fixedFeeProofUrl : record.commissionProofUrl;
  const pushed = isFixed
    ? record.fixedFeePushedToChannel
    : record.commissionPushedToChannel;

  // 表单状态
  const [receivedInput, setReceivedInput] = useState(
    received != null ? String(received) : "",
  );
  const [rateInput, setRateInput] = useState(
    rate ? `${(rate * 100).toFixed(2)}%` : "",
  );
  const [currencyInput, setCurrencyInput] = useState(currency);
  const [estInput, setEstInput] = useState(toInputDate(estDate));
  const [actInput, setActInput] = useState(toInputDate(actDate));
  const [proofInput, setProofInput] = useState(proofUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);

  function parsePct(s: string): number {
    if (!s) return 0;
    const n = Number(s.replace(/[%\s]/g, ""));
    if (!Number.isFinite(n)) return 0;
    return n > 1 ? n / 100 : n;
  }

  async function save() {
    setSaving(true);
    try {
      const recvNum = receivedInput ? Number(receivedInput) : null;
      const rateNum = parsePct(rateInput);
      const body: Record<string, unknown> = isFixed
        ? {
            fixedFeeReceived: recvNum,
            fixedFeeShareRate: rateNum,
            fixedFeeShareCurrency: currencyInput,
            fixedFeeEstimatedDate: estInput || null,
            fixedFeeActualDate: actInput || null,
            fixedFeeProofUrl: proofInput || null,
          }
        : {
            commissionReceived: recvNum,
            commissionShareRate: rateNum,
            commissionShareCurrency: currencyInput,
            commissionEstimatedDate: estInput || null,
            commissionActualDate: actInput || null,
            commissionProofUrl: proofInput || null,
          };
      const res = await fetch(
        `/api/finance/channel-reconciliations/${record.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        alert((await res.json()).error ?? "保存失败");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function push() {
    setPushing(true);
    try {
      const res = await fetch(
        `/api/finance/channel-reconciliations/${record.id}/push`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ side }),
        },
      );
      if (!res.ok) {
        alert((await res.json()).error ?? "推送失败");
        return;
      }
      onSaved();
    } finally {
      setPushing(false);
    }
  }

  const sym = currencyInput === "美金" ? "$" : "¥";
  const previewAmount =
    receivedInput && rateInput ? Number(receivedInput) * parsePct(rateInput) : 0;

  const accent =
    tone === "emerald"
      ? "border-l-emerald-400 bg-emerald-50/40"
      : "border-l-amber-400 bg-amber-50/40";

  return (
    <div
      className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 ${accent}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
        {pushed && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
            已推送渠道商
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label text-xs">
            {isFixed ? "到账固费金额" : "到账抽佣金额"}
          </label>
          <input
            type="number"
            className="input"
            placeholder="实际结算后填写"
            value={receivedInput}
            onChange={(e) => setReceivedInput(e.target.value)}
            step="0.01"
          />
        </div>
        <div>
          <label className="label text-xs">分账比例</label>
          <input
            className="input"
            placeholder="如 30%"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
          />
        </div>
        <div>
          <label className="label text-xs">分账金额（自动）</label>
          <input
            className="input bg-slate-50"
            readOnly
            value={
              previewAmount > 0
                ? `${sym}${previewAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                : amount > 0
                  ? `${sym}${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                  : "—"
            }
          />
        </div>
        <div>
          <label className="label text-xs">货币</label>
          <select
            className="input"
            value={currencyInput}
            onChange={(e) => setCurrencyInput(e.target.value)}
          >
            {FEE_CURRENCY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs">预计结算时间</label>
          <input
            type="date"
            className="input"
            value={estInput}
            onChange={(e) => setEstInput(e.target.value)}
          />
        </div>
        <div>
          <label className="label text-xs">实际结算时间</label>
          <input
            type="date"
            className="input"
            value={actInput}
            onChange={(e) => setActInput(e.target.value)}
          />
        </div>
        <div className="sm:col-span-3">
          <label className="label text-xs">转账截图 URL</label>
          <input
            type="url"
            className="input"
            placeholder="粘贴转账凭证图片链接"
            value={proofInput}
            onChange={(e) => setProofInput(e.target.value)}
          />
          {proofInput && (
            <a
              href={proofInput}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-brand-600 hover:underline"
            >
              查看附件 ↗
            </a>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={saving}
          onClick={save}
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          disabled={pushing || !actDate}
          title={!actDate ? "需先填写实际结算时间" : "推送给渠道商"}
          onClick={push}
        >
          <Send className="h-3.5 w-3.5" />
          {pushing ? "推送中…" : pushed ? "再次推送" : "推送给渠道商"}
        </button>
      </div>
    </div>
  );
}
