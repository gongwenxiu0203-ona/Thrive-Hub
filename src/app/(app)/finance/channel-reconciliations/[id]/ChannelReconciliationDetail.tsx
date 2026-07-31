"use client";

import { useRef, useState, type ClipboardEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Settings, CheckCircle2, DollarSign, TrendingUp, Calendar, Clock,
  Save, LockKeyhole, Landmark, PencilLine, Send, SkipForward, AlertTriangle,
  Upload, Image as ImageIcon,
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
  recordMode: string;
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
  fixedFeeReceivedCurrency: string;
  commissionReceivedCurrency: string;
  channelPayeeSnapshot: ChannelPayeeSnapshot;
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
    commissionThresholdAmount: number;
    commissionThresholdCurrency: string;
    commissionBelowRate: number;
    commissionAtOrAboveRate: number;
    tieredRules: string;
  } | null;
  periods: {
    id: string;
    streamType: "BOTH" | "FIXED_FEE" | "COMMISSION";
    periodIndex: number;
    periodLabel: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    fixedFeeAmount: number | null;
    commissionAmount: number | null;
    fixedFeePaidAt: string | null;
    commissionPaidAt: string | null;
    fixedFeeReceived: number | null;
    commissionReceived: number | null;
    fixedFeeShareRate: number | null;
    commissionShareRate: number | null;
    fixedFeeShareAmount: number | null;
    commissionShareAmount: number | null;
    fixedFeeReceivedCurrency: string | null;
    commissionReceivedCurrency: string | null;
    fixedFeeSplitDate: string | null;
    commissionSplitDate: string | null;
    confirmedGmv: number | null;
    proofUrl: string | null;
    notes: string | null;
    channelReviewStatus: "DRAFT" | "PENDING" | "CONFIRMED" | "DISPUTED" | "SKIPPED";
    channelPushedAt: string | null;
    channelReviewedAt: string | null;
    channelDisputeReason: string | null;
    channelReviewVersion: number;
    paymentProofUrl: string | null;
  }[];
}

type ChannelPayeeSnapshot = {
  paymentMethod: string;
  beneficiary: string;
  accountNo: string;
  bankName: string;
  bankAddress: string;
  swiftCode: string;
  paypalAccount: string;
  note: string;
};

type StreamKind = "fixed" | "commission";
const RECEIVED_CURRENCY_OPTIONS = ["USD", "RMB", "EUR", "GBP", "HKD"] as const;

function parsePaymentProofUrls(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((url): url is string => typeof url === "string" && url.length > 0);
    }
  } catch {}
  return [value];
}

const EMPTY_PAYEE: ChannelPayeeSnapshot = {
  paymentMethod: "",
  beneficiary: "",
  accountNo: "",
  bankName: "",
  bankAddress: "",
  swiftCode: "",
  paypalAccount: "",
  note: "",
};

function ChannelPayeeCard({
  reconciliationId,
  payee,
  canEdit,
}: {
  reconciliationId: string;
  payee: ChannelPayeeSnapshot;
  canEdit: boolean;
}) {
  const router = useRouter();
  const hasSavedInfo = Object.values(payee).some((value) => value.trim());
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ChannelPayeeSnapshot>({ ...EMPTY_PAYEE, ...payee });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(field: keyof ChannelPayeeSnapshot, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    if (!Object.values(form).some((value) => value.trim())) {
      setError("请至少填写一项渠道商收款信息");
      return;
    }
    if (hasSavedInfo && !reason.trim()) {
      setError("修改已保存的收款信息时，请填写修改原因");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/finance/channel-reconciliations/${reconciliationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelPayeeSnapshot: Object.fromEntries(
            Object.entries(form).map(([key, value]) => [key, value.trim()]),
          ),
          ...(hasSavedInfo ? { correctionReason: reason.trim() } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "保存失败");
        return;
      }
      setEditing(false);
      setReason("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const displayItems = ([
    ["付款方式", payee.paymentMethod],
    ["收款人 / 户名", payee.beneficiary],
    ["收款账号", payee.accountNo],
    ["开户银行", payee.bankName],
    ["银行地址", payee.bankAddress],
    ["SWIFT Code", payee.swiftCode],
    ["PayPal 账号", payee.paypalAccount],
    ["备注", payee.note],
  ] as [string, string][]).filter((item) => Boolean(item[1]));

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-brand-600" />
            <h2 className="font-semibold text-slate-800">渠道商收款信息</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">用于向渠道商实际付款，请在付款前复核账号。</p>
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            onClick={() => setEditing(true)}
          >
            <PencilLine className="h-3.5 w-3.5" />
            {hasSavedInfo ? "编辑收款信息" : "新增收款信息"}
          </button>
        )}
      </div>

      {!editing && (
        hasSavedInfo ? (
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {displayItems.map(([label, value]) => (
              <div key={label} className={label === "备注" || label === "银行地址" ? "lg:col-span-2" : ""}>
                <dt className="text-xs text-slate-400">{label}</dt>
                <dd className="mt-1 break-words font-medium text-slate-700">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-400">
            暂未填写渠道商收款信息
          </p>
        )
      )}

      {editing && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">付款方式</label>
              <select className="input" value={form.paymentMethod} onChange={(e) => setField("paymentMethod", e.target.value)}>
                <option value="">请选择</option>
                <option value="银行转账">银行转账</option>
                <option value="PayPal">PayPal</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div>
              <label className="label">收款人 / 户名</label>
              <input className="input" value={form.beneficiary} onChange={(e) => setField("beneficiary", e.target.value)} />
            </div>
            <div>
              <label className="label">收款账号</label>
              <input className="input" value={form.accountNo} onChange={(e) => setField("accountNo", e.target.value)} />
            </div>
            <div>
              <label className="label">开户银行</label>
              <input className="input" value={form.bankName} onChange={(e) => setField("bankName", e.target.value)} />
            </div>
            <div>
              <label className="label">SWIFT Code</label>
              <input className="input" value={form.swiftCode} onChange={(e) => setField("swiftCode", e.target.value)} />
            </div>
            <div>
              <label className="label">PayPal 账号</label>
              <input className="input" value={form.paypalAccount} onChange={(e) => setField("paypalAccount", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">银行地址</label>
              <input className="input" value={form.bankAddress} onChange={(e) => setField("bankAddress", e.target.value)} />
            </div>
            <div>
              <label className="label">备注</label>
              <input className="input" value={form.note} onChange={(e) => setField("note", e.target.value)} />
            </div>
          </div>
          {hasSavedInfo && (
            <div>
              <label className="label">修改原因 *</label>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="请说明本次修改原因" />
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setForm({ ...EMPTY_PAYEE, ...payee });
                setReason("");
                setError(null);
                setEditing(false);
              }}
            >
              取消
            </button>
            <button type="button" className="btn-primary" disabled={saving || (hasSavedInfo && !reason.trim())} onClick={save}>
              {saving ? "保存中…" : "保存收款信息"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RuleDrivenPeriodCard({
  reconciliationId,
  period,
  kind,
  ruleType,
  commissionRuleCurrency,
  currency,
  displayIndex,
  totalPeriods,
  canEdit,
  isChannel,
}: {
  reconciliationId: string;
  period: DetailRecord["periods"][number];
  kind: StreamKind;
  ruleType: string;
  commissionRuleCurrency: string;
  currency: string;
  displayIndex: number;
  totalPeriods: number;
  canEdit: boolean;
  isChannel: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFixed = kind === "fixed";
  const paidAt = isFixed ? period.fixedFeePaidAt : period.commissionPaidAt;
  const isFirstEntry = isFixed
    ? period.fixedFeeReceived === null && period.fixedFeeShareAmount === null
    : period.commissionReceived === null && period.commissionShareAmount === null;
  const complete = (isFixed ? period.fixedFeeShareAmount : period.commissionShareAmount) !== null;
  const reviewStatus = period.channelReviewStatus ?? "DRAFT";
  const reviewLocked = reviewStatus === "PENDING" || reviewStatus === "CONFIRMED" || reviewStatus === "SKIPPED";
  const locked = Boolean(paidAt) || reviewLocked;
  const canPay = canEdit && complete && (reviewStatus === "CONFIRMED" || reviewStatus === "SKIPPED") && !paidAt;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState(String((isFixed ? period.fixedFeeReceived : period.commissionReceived) ?? ""));
  const [receivedCurrency, setReceivedCurrency] = useState((isFixed ? period.fixedFeeReceivedCurrency : period.commissionReceivedCurrency) ?? currency);
  const [serviceStart, setServiceStart] = useState(period.periodStart?.slice(0, 10) ?? "");
  const [serviceEnd, setServiceEnd] = useState(period.periodEnd?.slice(0, 10) ?? "");
  const [paymentDate, setPaymentDate] = useState(paidAt?.slice(0, 10) ?? "");
  const [paymentNote, setPaymentNote] = useState("");
  const [editingPayment, setEditingPayment] = useState(false);
  const [gmv, setGmv] = useState(String(period.confirmedGmv ?? ""));
  const [reason, setReason] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const shareRate = isFixed ? period.fixedFeeShareRate : period.commissionShareRate;
  const shareAmount = isFixed ? period.fixedFeeShareAmount : period.commissionShareAmount;
  const displayCurrency = (isFixed ? period.fixedFeeReceivedCurrency : period.commissionReceivedCurrency) ?? currency;
  const cycleName = isFixed ? "到账固费对应服务周期" : "到账销售佣金对应服务周期";
  const cycleLabel = serviceStart && serviceEnd ? `${serviceStart} ～ ${serviceEnd}` : "—";

  async function save() {
    if (locked && reviewStatus !== "DISPUTED") return;
    if (!serviceStart || !serviceEnd || serviceEnd < serviceStart) return setError("请填写正确的服务周期起止时间");
    if (!isFixed && ruleType === "A" && receivedCurrency !== commissionRuleCurrency) return setError(`A 类佣金规则按 ${commissionRuleCurrency} 判断，请选择相同货币`);
    if (!isFirstEntry && !reason.trim()) return setError(reviewStatus === "DISPUTED" ? "渠道商提出异议后纠错必须填写纠错原因" : "修改已录入数据时，请填写修改原因");
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/finance/channel-reconciliations/${reconciliationId}/periods/${period.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isFixed ? { fixedFeeReceived: received === "" ? null : Number(received), ...(isFirstEntry ? { fixedFeeReceivedCurrency: receivedCurrency } : {}) }
            : { commissionReceived: received === "" ? null : Number(received), ...(isFirstEntry ? { commissionReceivedCurrency: receivedCurrency } : {}), ...(ruleType === "B" ? { confirmedGmv: gmv === "" ? null : Number(gmv) } : {}) }),
          periodStart: serviceStart, periodEnd: serviceEnd,
          ...(!isFirstEntry ? { correctionReason: reason.trim() } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error ?? "保存失败");
      setEditing(false); setReason(""); router.refresh();
    } finally { setSaving(false); }
  }

  async function reviewFlow(action: "PUSH" | "SKIP") {
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/finance/channel-reconciliations/${reconciliationId}/periods/${period.id}/review-flow`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedVersion: period.channelReviewVersion }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error ?? "操作失败");
      router.refresh();
    } finally { setSaving(false); }
  }

  async function channelReview(action: "CONFIRM" | "DISPUTE") {
    if (action === "DISPUTE" && !disputeReason.trim()) return setError("请填写异议原因");
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/finance/channel-reconciliations/${reconciliationId}/periods/${period.id}/channel-review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: disputeReason.trim() || undefined, expectedVersion: period.channelReviewVersion }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error ?? "提交失败");
      setDisputeReason(""); router.refresh();
    } finally { setSaving(false); }
  }

  function addProofFiles(files: File[]) {
    const accepted = files.filter((file) => file.type.startsWith("image/") || file.type === "application/pdf");
    setProofFiles((current) => [...current, ...accepted].slice(0, 10));
  }
  function selectProof(event: ChangeEvent<HTMLInputElement>) {
    addProofFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }
  function pasteProof(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length > 0) {
      event.preventDefault();
      addProofFiles(files);
    }
  }
  async function uploadProofs(): Promise<string[] | null> {
    const existing = parsePaymentProofUrls(period.paymentProofUrl);
    const uploaded: string[] = [];
    for (const file of proofFiles) {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/finance/channel-reconciliations/${reconciliationId}/periods/${period.id}/payment-proof`, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "付款回单上传失败");
        return null;
      }
      if (typeof payload.paymentProofUrl === "string") uploaded.push(payload.paymentProofUrl);
    }
    return [...existing, ...uploaded].slice(0, 10);
  }

  async function savePayment() {
    if (proofFiles.length === 0 && parsePaymentProofUrls(period.paymentProofUrl).length === 0) {
      setError("请上传或粘贴付款回单");
      return;
    }
    if (!canPay || !paymentDate) return setError("请填写实际付款日期");
    setSaving(true); setError(null);
    try {
      const paymentProofUrls = await uploadProofs();
      if (!paymentProofUrls) return;
      const response = await fetch(`/api/finance/channel-reconciliations/${reconciliationId}/periods/${period.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(isFixed ? { fixedFeePaidAt: paymentDate } : { commissionPaidAt: paymentDate }), paymentProofUrl: JSON.stringify(paymentProofUrls), correctionReason: paymentNote.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error ?? "保存付款信息失败");
      setEditingPayment(false); setPaymentNote(""); setProofFiles([]); router.refresh();
    } finally { setSaving(false); }
  }

  const statusMap = {
    DRAFT: ["待推送", "bg-slate-100 text-slate-600"], PENDING: ["待渠道商确认", "bg-amber-100 text-amber-700"],
    CONFIRMED: ["渠道商已确认", "bg-emerald-100 text-emerald-700"], DISPUTED: ["渠道商有异议", "bg-red-100 text-red-700"],
    SKIPPED: ["已跳过渠道确认", "bg-blue-100 text-blue-700"],
  } as const;
  const status = statusMap[reviewStatus];

  return (
    <article className={`relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm ${paidAt ? "border-emerald-200" : reviewStatus === "DISPUTED" ? "border-red-200" : "border-slate-200"}`}>
      <div className="absolute -left-[27px] top-5 h-3 w-3 rounded-full border-2 border-white bg-brand-500 ring-2 ring-brand-100" />
      {paidAt && <div className="pointer-events-none absolute right-5 top-12 z-10 -rotate-12 rounded-md border-[3px] border-emerald-500/55 px-3 py-1 text-2xl font-black tracking-[0.18em] text-emerald-600/55">已付款</div>}
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-slate-800">{period.periodLabel ?? `第 ${displayIndex} 期`}</p><p className="mt-1 text-xs text-slate-400">第 {displayIndex} / {totalPeriods} 期 · {paidAt ? "已付款并锁定" : complete ? "已录入" : "待录入"}</p></div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${status[1]}`}>{status[0]}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4 text-xs">
        <div><dt className="text-slate-400">Thraive 实际到账</dt><dd className="mt-1 font-medium text-slate-700">{fmtMoney(isFixed ? period.fixedFeeReceived : period.commissionReceived, displayCurrency)}</dd></div>
        <div><dt className="text-slate-400">分账比例</dt><dd className="mt-1 font-medium text-slate-700">{fmtPct(shareRate)}</dd></div>
        <div><dt className="text-slate-400">渠道商分账金额</dt><dd className="mt-1 font-semibold text-emerald-600">{fmtMoney(shareAmount, displayCurrency)}</dd></div>
        <div><dt className="text-slate-400">向渠道商实际付款时间</dt><dd className="mt-1 font-medium text-slate-700">{paidAt?.slice(0, 10) ?? "—"}</dd></div>
        <div className="col-span-2"><dt className="text-slate-400">{cycleName}</dt><dd className="mt-1 font-medium text-slate-700">{cycleLabel}</dd></div>
      </dl>
      {period.channelDisputeReason && <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700"><strong>渠道商异议：</strong>{period.channelDisputeReason}</div>}
      {parsePaymentProofUrls(period.paymentProofUrl).map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="mr-3 mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><ImageIcon className="h-3.5 w-3.5" />查看付款回单 {index + 1}</a>)}

      {!isChannel && canEdit && !paidAt && !reviewLocked && <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={() => { setEditingPayment(false); setEditing((v) => !v); setError(null); }}>{editing ? "收起" : isFirstEntry ? "录入" : reviewStatus === "DISPUTED" ? "纠错" : "修改"}</button>
        {complete && reviewStatus === "DRAFT" && <><button type="button" className="btn-primary inline-flex items-center gap-1 text-xs" disabled={saving} onClick={() => void reviewFlow("PUSH")}><Send className="h-3.5 w-3.5" />推送渠道商确认</button><button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs" disabled={saving} onClick={() => void reviewFlow("SKIP")}><SkipForward className="h-3.5 w-3.5" />跳过确认</button></>}
      </div>}
      {!isChannel && canPay && <div className="mt-3 flex justify-end"><button type="button" className="text-xs font-medium text-emerald-600" onClick={() => { setEditing(false); setEditingPayment((v) => !v); setError(null); }}>{editingPayment ? "收起付款信息" : "补充付款信息"}</button></div>}
      {isChannel && reviewStatus === "PENDING" && !paidAt && <div className="mt-4 space-y-3 border-t border-amber-100 pt-3"><p className="text-xs text-slate-600">请核对本期金额与服务周期。确认后数据将锁定；如有问题请填写具体原因。</p><textarea className="input min-h-20 resize-y" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="选择有异议时，请填写异议原因" />{error && <p className="text-xs text-red-600">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-secondary inline-flex items-center gap-1" disabled={saving || !disputeReason.trim()} onClick={() => void channelReview("DISPUTE")}><AlertTriangle className="h-4 w-4" />有异议</button><button type="button" className="btn-primary inline-flex items-center gap-1" disabled={saving} onClick={() => void channelReview("CONFIRM")}><CheckCircle2 className="h-4 w-4" />确认无异议</button></div></div>}

      {editing && !paidAt && !reviewLocked && !isChannel && <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
        <div><label className="label">Thraive 实际到账金额</label><div className="flex h-10 overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100"><span className="flex min-w-11 items-center justify-center border-r border-slate-200 bg-slate-50 px-2 text-sm font-semibold text-slate-600">{currencySymbol(receivedCurrency)}</span><input type="number" min="0" step="0.01" inputMode="decimal" className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-800 outline-none" value={received} onChange={(e) => setReceived(e.target.value)} />{isFirstEntry ? <select aria-label="到账货币" className="border-l border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-700 outline-none" value={receivedCurrency} onChange={(e) => setReceivedCurrency(e.target.value)}>{RECEIVED_CURRENCY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600">{displayCurrency}</span>}</div></div>
        {!isFixed && ruleType === "B" && <div><label className="label">本期确认 GMV</label><input type="number" min="0" step="0.01" className="input" value={gmv} onChange={(e) => setGmv(e.target.value)} /></div>}
        <div><label className="label">{cycleName} *</label><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input type="date" className="input min-w-0" value={serviceStart} onChange={(e) => setServiceStart(e.target.value)} /><span className="text-xs text-slate-400">至</span><input type="date" className="input min-w-0" min={serviceStart || undefined} value={serviceEnd} onChange={(e) => setServiceEnd(e.target.value)} /></div></div>
        {!isFirstEntry && <div><label className="label">{reviewStatus === "DISPUTED" ? "纠错原因" : "修改原因"} *</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="请说明本次修改原因" /></div>}
        {error && <p className="text-xs text-red-600">{error}</p>}<button type="button" className="btn-primary flex w-full items-center justify-center gap-1.5" disabled={saving || !serviceStart || !serviceEnd || (!isFirstEntry && !reason.trim())} onClick={() => void save()}><Save className="h-4 w-4" />{saving ? "保存中…" : reviewStatus === "DISPUTED" ? "保存纠错，之后重新推送" : "保存并重新计算"}</button>
      </div>}
      {editingPayment && canPay && <div className="mt-4 space-y-3 border-t border-emerald-100 bg-emerald-50/40 pt-3"><div><label className="label">向渠道商实际付款时间 *</label><input type="date" className="input" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div><div><label className="label">付款确认说明（选填）</label><textarea className="input min-h-20 resize-y" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} /></div><div tabIndex={0} onPaste={pasteProof} className="rounded-lg border border-dashed border-slate-300 bg-white p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium text-slate-700">付款回单（图片或 PDF）</p><p className="mt-1 text-[11px] text-slate-400">可选择文件，也可点击此区域后直接粘贴截图</p></div><button type="button" className="btn-secondary inline-flex items-center gap-1 text-xs" onClick={() => fileInputRef.current?.click()}><Upload className="h-3.5 w-3.5" />选择文件</button></div><input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,application/pdf" className="hidden" onChange={selectProof} />{proofFiles.length > 0 && <div className="mt-2 space-y-1">{proofFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-2 text-xs text-emerald-700"><span className="truncate">{file.name}</span><button type="button" className="text-red-500" onClick={() => setProofFiles((files) => files.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div>)}</div>}</div><p className="text-xs text-amber-700">确认后本期将盖上“已付款”印章并永久锁定，不能再修改。</p>{error && <p className="text-xs text-red-600">{error}</p>}<button type="button" className="btn-primary flex w-full items-center justify-center gap-1.5" disabled={saving || !paymentDate || (proofFiles.length === 0 && parsePaymentProofUrls(period.paymentProofUrl).length === 0)} onClick={() => void savePayment()}><CheckCircle2 className="h-4 w-4" />{saving ? "确认中…" : "确认付款并锁定"}</button></div>}
      {error && !editing && !editingPayment && !(isChannel && reviewStatus === "PENDING") && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </article>
  );
}
type AdminCustomerOption = {
  id: string;
  brandName: string;
  splitEndDate: string | null;
  contracts: { id: string; contractNo: string; startDate: string | null }[];
};

function AdminRecordActions({
  record,
  customerOptions,
}: {
  record: DetailRecord;
  customerOptions: AdminCustomerOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [customerId, setCustomerId] = useState(record.customer.id);
  const [contractId, setContractId] = useState(record.contract?.id ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customer = customerOptions.find((item) => item.id === customerId);

  async function save() {
    if (!contractId || !reason.trim()) {
      setError("请选择合同并填写修改原因");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/finance/channel-reconciliations/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, contractId, correctionReason: reason.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "修改失败");
        return;
      }
      setEditing(false);
      setReason("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const deletionReason = window.prompt("请填写删除原因");
    if (!deletionReason?.trim()) return;
    if (!window.confirm("删除后记录将进入软删除状态，确定继续吗？")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/finance/channel-reconciliations/${record.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deletionReason.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "删除失败");
        return;
      }
      router.push("/finance?tab=channels");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => setEditing((value) => !value)} disabled={saving}>
          <PencilLine className="h-4 w-4" /> 重新编辑记录
        </button>
        <button type="button" className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50" onClick={() => void remove()} disabled={saving}>
          删除记录
        </button>
      </div>
      {editing && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-800">管理员重新编辑</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">客户</label>
              <select className="input" value={customerId} onChange={(event) => {
                const nextId = event.target.value;
                const nextCustomer = customerOptions.find((item) => item.id === nextId);
                setCustomerId(nextId);
                setContractId(nextCustomer?.contracts.length === 1 ? nextCustomer.contracts[0].id : "");
              }}>
                {customerOptions.map((item) => <option key={item.id} value={item.id}>{item.brandName}</option>)}
              </select>
            </div>
            <div>
              <label className="label">关联合同</label>
              <select className="input" value={contractId} onChange={(event) => setContractId(event.target.value)}>
                <option value="">请选择合同</option>
                {customer?.contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNo}</option>)}
              </select>
            </div>
            <div>
              <label className="label">开始时间</label>
              <input className="input bg-slate-50" readOnly value={customer?.contracts.find((contract) => contract.id === contractId)?.startDate ?? ""} />
            </div>
            <div>
              <label className="label">结束时间</label>
              <input className="input bg-slate-50" readOnly value={customer?.splitEndDate ?? ""} />
            </div>
          </div>
          <div className="mt-3">
            <label className="label">修改原因 *</label>
            <textarea className="input min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明本次纠正原因" />
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>取消</button>
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>{saving ? "保存中…" : "保存并重新生成周期"}</button>
          </div>
          <p className="mt-2 text-xs text-amber-700">已有金额、GMV 或付款记录时，系统会阻止重建周期。</p>
        </div>
      )}
      {!editing && error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
function RuleDrivenDetail({
  record, canEdit, isAdmin, adminCustomerOptions, isChannel,
}: {
  record: DetailRecord;
  canEdit: boolean;
  isAdmin: boolean;
  adminCustomerOptions: AdminCustomerOption[];
  isChannel: boolean;
}) {
  const fixedPeriods = record.periods.filter((period) => period.streamType !== "COMMISSION");
  const commissionPeriods = record.periods.filter((period) => period.streamType !== "FIXED_FEE");
  const fixedCompleted = fixedPeriods.filter((period) => period.fixedFeeShareAmount !== null).length;
  const commissionCompleted = commissionPeriods.filter((period) => period.commissionShareAmount !== null).length;
  const streamTotal = (periods: DetailRecord["periods"], kind: StreamKind, fallbackCurrency: string) => {
    const totals = new Map<string, number>();
    for (const period of periods) {
      const periodCurrency =
        (kind === "fixed"
          ? period.fixedFeeReceivedCurrency
          : period.commissionReceivedCurrency) ?? fallbackCurrency;
      const amount =
        (kind === "fixed"
          ? period.fixedFeeShareAmount
          : period.commissionShareAmount) ?? 0;
      totals.set(periodCurrency, (totals.get(periodCurrency) ?? 0) + amount);
    }
    return [...totals.entries()]
      .map(([periodCurrency, amount]) => fmtMoney(amount, periodCurrency))
      .join(" · ");
  };
  const fixedTotal = streamTotal(fixedPeriods, "fixed", record.fixedFeeReceivedCurrency);
  const commissionTotal = streamTotal(commissionPeriods, "commission", record.commissionReceivedCurrency);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/finance?tab=channels" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
            <ArrowLeft className="h-4 w-4" /> 返回渠道商分账
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">{record.customer.brandName} · 渠道商分账</h1>
          <p className="mt-1 text-sm text-slate-500">合同 {record.contract?.contractNo ?? "—"} · 渠道商 {record.channelUser.name}</p>
        </div>        {!isAdmin && !isChannel && (
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => window.alert("只有管理员可以修改主记录，请联系管理员")}>修改主记录</button>
            <button type="button" className="btn-secondary text-red-600" onClick={() => window.alert("只有管理员可以删除主记录，请联系管理员")}>删除主记录</button>
          </div>
        )}
      </div>
      {isAdmin && <AdminRecordActions record={record} customerOptions={adminCustomerOptions} />}
      <ChannelPayeeCard
        reconciliationId={record.id}
        payee={record.channelPayeeSnapshot}
        canEdit={canEdit}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4"><p className="text-xs text-slate-400">固费总期数</p><p className="mt-1 text-2xl font-semibold">{fixedPeriods.length}</p><p className="text-xs text-emerald-600">已录入 {fixedCompleted} 期</p></div>
        <div className="card p-4"><p className="text-xs text-slate-400">固费分账累计</p><p className="mt-1 text-2xl font-semibold text-emerald-600">{fixedTotal}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-400">抽佣总期数</p><p className="mt-1 text-2xl font-semibold">{commissionPeriods.length}</p><p className="text-xs text-emerald-600">已录入 {commissionCompleted} 期</p></div>
        <div className="card p-4"><p className="text-xs text-slate-400">抽佣分账累计</p><p className="mt-1 text-2xl font-semibold text-emerald-600">{commissionTotal}</p></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {(["fixed", "commission"] as const).map((kind) => (
          <section key={kind} className="card p-5">
            <div className="mb-5">
              <h2 className="font-semibold text-slate-800">{kind === "fixed" ? "固费分账瀑布流" : "抽佣分账瀑布流"}</h2>
              <p className="mt-1 text-xs text-slate-400">
                {kind === "fixed"
                  ? `按合同开始日滚动，每 30 天一个服务周期 · 分账比例 ${fmtPct(record.splitRule?.fixedFeeRate)}`
                  : record.splitRule?.ruleType === "A"
                    ? `按自然月划分 · 每月实际到账低于 ${record.splitRule.commissionThresholdCurrency} ${record.splitRule.commissionThresholdAmount} 按 ${fmtPct(record.splitRule.commissionBelowRate)}；达到或超过按 ${fmtPct(record.splitRule.commissionAtOrAboveRate)}`
                    : "按自然月划分 · 沿用 B 类原阶梯规则，按本期确认 GMV 计算"}
              </p>
            </div>
            <div className="ml-3 space-y-4 border-l-2 border-slate-100 pl-5">
              {(kind === "fixed" ? fixedPeriods : commissionPeriods).map((period, index, periods) => (
                <RuleDrivenPeriodCard
                  key={`${kind}-${period.id}`}
                  reconciliationId={record.id}
                  period={period}
                  kind={kind}
                  ruleType={record.splitRule?.ruleType ?? "A"}
                  commissionRuleCurrency={record.splitRule?.commissionThresholdCurrency ?? "USD"}
                  currency={kind === "fixed" ? record.fixedFeeReceivedCurrency : record.commissionReceivedCurrency}
                  displayIndex={index + 1}
                  totalPeriods={periods.length}
                  canEdit={canEdit}
                  isChannel={isChannel}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function currencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    RMB: "¥",
    CNY: "¥",
    EUR: "€",
    GBP: "£",
    HKD: "HK$",
    美金: "$",
    人民币: "¥",
  };
  return symbols[currency] ?? currency;
}

function fmtMoney(v: number | null | undefined, currency = "RMB"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const symbol = currencySymbol(currency);
  const prefix = symbol === currency ? `${currency} ` : symbol;
  return `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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
  record, derivedPeriods, isAdmin, adminCustomerOptions, isStaff, canEdit, isChannel,
}: {
  record: DetailRecord;
  derivedPeriods: PeriodDerived[];
  isAdmin: boolean;
  adminCustomerOptions: AdminCustomerOption[];
  isStaff: boolean;
  canEdit: boolean;
  isChannel: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (record.recordMode === "RULE_DRIVEN") {
    return (
      <RuleDrivenDetail
        record={record}
        canEdit={canEdit}
        isAdmin={isAdmin}
        adminCustomerOptions={adminCustomerOptions}
        isChannel={isChannel}
      />
    );
  }

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
