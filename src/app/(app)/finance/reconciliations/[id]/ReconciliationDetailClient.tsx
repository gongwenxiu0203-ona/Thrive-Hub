"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import {
  RECONCILIATION_STATUS_LABELS,
  RECONCILIATION_STATUS_COLORS,
  RECONCILIATION_STATUS_ORDER,
  BET_TYPE_LABELS,
  BET_RESULT_LABELS,
  BET_RESULT_COLORS,
  SETTLEMENT_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  REVIEW_ACTION_LABELS,
  REVIEW_ACTION_COLORS,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

type Review = {
  id: string;
  action: string;
  disputedOrders: number | null;
  disputedSalesAmount: number | null;
  note: string | null;
  createdAt: Date | string;
  reviewer: { id: string; name: string };
};

type Settlement = {
  id: string;
  type: string;
  amount: number;
  status: string;
  estimatedDate: Date | string | null;
  actualDate: Date | string | null;
  reminderSent: boolean;
  note: string | null;
  createdBy: { id: string; name: string };
};

type Rec = {
  id: string;
  status: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  partyA: string | null;
  accountingPeriod: string | null;
  feeCycle: string | null;
  feeAmount: number;
  commissionRate: number;
  affiliateRule: string | null;
  paymentCycle: string | null;
  betType: string;
  betOrderCount: number | null;
  betSalesAmount: number | null;
  actualOrders: number;
  actualSalesAmount: number;
  betResult: string | null;
  actualCommissionRate: number;
  commissionAmount: number;
  finalOrders: number | null;
  finalSalesAmount: number | null;
  finalCommissionAmount: number | null;
  submittedAt: Date | string | null;
  customer: {
    id: string;
    brandName: string;
    businessOwnerId: string | null;
    businessOwner: { id: string; name: string; email: string } | null;
  };
  contract: { id: string; contractNo: string; type: string; startDate: Date | string | null; endDate: Date | string | null };
  createdBy: { id: string; name: string };
  submittedBy: { id: string; name: string } | null;
  reviews: Review[];
  settlements: Settlement[];
};

type Props = {
  rec: Rec;
  currentUserId: string;
  users: { id: string; name: string; role: string }[];
};

export function ReconciliationDetailClient({ rec, currentUserId, users: _users }: Props) {
  void _users;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pulling, setPulling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<"APPROVED" | "DISPUTED">("APPROVED");

  const isDraft = rec.status === "DRAFT";
  const isPendingReview = rec.status === "PENDING_REVIEW";
  const isDisputed = rec.status === "DISPUTED";
  const isConfirmed = rec.status === "CONFIRMED";

  const statusIdx = RECONCILIATION_STATUS_ORDER.indexOf(
    rec.status as typeof RECONCILIATION_STATUS_ORDER[number],
  );

  async function pullBiData() {
    setPulling(true);
    try {
      const res = await fetch(`/api/finance/reconciliations/${rec.id}/pull-bi`, { method: "POST" });
      if (!res.ok) { alert((await res.json()).error ?? "拉取失败"); return; }
      startTransition(() => router.refresh());
    } finally {
      setPulling(false);
    }
  }

  async function submitReconciliation() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/reconciliations/${rec.id}/submit`, { method: "POST" });
      if (!res.ok) { alert((await res.json()).error ?? "提交失败"); return; }
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 状态流转 */}
      <div className="card flex items-center gap-2 overflow-x-auto p-4">
        {RECONCILIATION_STATUS_ORDER.map((s, i) => {
          const reached = statusIdx >= i;
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex h-7 items-center rounded-full px-3 text-xs font-medium ${
                  reached ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {RECONCILIATION_STATUS_LABELS[s]}
              </span>
              {i < RECONCILIATION_STATUS_ORDER.length - 1 && (
                <span className="text-slate-300">→</span>
              )}
            </div>
          );
        })}
        <Badge className={RECONCILIATION_STATUS_COLORS[rec.status] + " ml-auto"}>
          {RECONCILIATION_STATUS_LABELS[rec.status] ?? rec.status}
        </Badge>
      </div>

      {/* ① 基本信息 */}
      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-slate-900">基本信息</h2>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="甲方合同主体" value={rec.partyA} />
          <Field label="关联客户" value={rec.customer.brandName} />
          <Field label="合同编号" value={rec.contract.contractNo} />
          <Field label="核算周期" value={rec.accountingPeriod} />
          <Field label="固费周期" value={rec.feeCycle} />
          <Field
            label="固费金额"
            value={rec.feeAmount > 0 ? `¥${rec.feeAmount.toLocaleString()}` : "—"}
          />
          <Field
            label="抽佣比例"
            value={rec.commissionRate > 0 ? `${(rec.commissionRate * 100).toFixed(2)}%` : "—"}
          />
          <Field label="联盟佣金规则" value={rec.affiliateRule} />
          <Field label="付款周期" value={rec.paymentCycle} />
          <Field label="是否对赌" value={BET_TYPE_LABELS[rec.betType] ?? rec.betType} />
          {(rec.betType === "ORDER_COUNT" || rec.betType === "BOTH") && (
            <Field label="对赌单量" value={rec.betOrderCount?.toString() ?? "—"} />
          )}
          {(rec.betType === "SALES_AMOUNT" || rec.betType === "BOTH") && (
            <Field
              label="对赌销售额"
              value={rec.betSalesAmount != null ? `¥${rec.betSalesAmount.toLocaleString()}` : "—"}
            />
          )}
          <Field label="客户负责人" value={rec.customer.businessOwner?.name ?? "—"} />
          <Field label="创建人" value={rec.createdBy.name} />
        </dl>
      </section>

      {/* ② 月度对账 */}
      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">月度对账</h2>
          {isDraft && (
            <div className="flex gap-2">
              <button
                onClick={pullBiData}
                disabled={pulling}
                className="btn-secondary text-sm"
              >
                {pulling ? "拉取中…" : "🔄 从BI拉取数据"}
              </button>
              <button
                onClick={submitReconciliation}
                disabled={submitting}
                className="btn-primary text-sm"
              >
                {submitting ? "提交中…" : "提交对账"}
              </button>
            </div>
          )}
          {(isPendingReview || isDisputed) && (
            <div className="flex gap-2">
              <button
                onClick={() => { setReviewAction("APPROVED"); setShowReviewModal(true); }}
                className="btn-primary text-sm"
              >
                ✅ 无异议确认
              </button>
              <button
                onClick={() => { setReviewAction("DISPUTED"); setShowReviewModal(true); }}
                className="btn-secondary text-sm text-rose-600"
              >
                ⚠️ 提出异议
              </button>
            </div>
          )}
          {isDisputed && rec.submittedById === currentUserId && (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="btn-primary text-sm"
            >
              最终确认
            </button>
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="对账起始时间" value={formatDate(rec.periodStart)} />
          <Field label="对账结束时间" value={formatDate(rec.periodEnd)} />
          <Field label="固费金额" value={`¥${rec.feeAmount.toLocaleString()}`} />
          {(rec.betType !== "NONE") && (
            <>
              {(rec.betType === "ORDER_COUNT" || rec.betType === "BOTH") && (
                <Field label="实际单量" value={rec.actualOrders.toString()} />
              )}
              {(rec.betType === "SALES_AMOUNT" || rec.betType === "BOTH") && (
                <Field
                  label="实际销售额"
                  value={`¥${rec.actualSalesAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}
                />
              )}
              <FieldNode
                label="对赌结果"
                value={
                  rec.betResult ? (
                    <Badge className={BET_RESULT_COLORS[rec.betResult]}>
                      {BET_RESULT_LABELS[rec.betResult] ?? rec.betResult}
                    </Badge>
                  ) : <span className="text-slate-400">待计算</span>
                }
              />
            </>
          )}
          {rec.betType === "NONE" && (
            <Field
              label="实际销售额"
              value={`¥${rec.actualSalesAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}
            />
          )}
          <Field
            label="实际抽佣比例"
            value={`${(rec.actualCommissionRate * 100).toFixed(2)}%`}
          />
          <Field
            label="抽佣金额"
            value={`¥${rec.commissionAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}
          />
        </dl>

        {isConfirmed && (
          <div className="mt-4 rounded-lg bg-emerald-50 p-3">
            <p className="mb-2 text-sm font-medium text-emerald-800">✅ 终版对账数据（已锁定）</p>
            <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <span className="text-slate-600">
                终版单量：<strong>{rec.finalOrders ?? "—"}</strong>
              </span>
              <span className="text-slate-600">
                终版销售额：<strong>¥{rec.finalSalesAmount?.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) ?? "—"}</strong>
              </span>
              <span className="text-slate-600">
                终版抽佣：<strong>¥{rec.finalCommissionAmount?.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) ?? "—"}</strong>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ③ 对账记录（历史） */}
      {rec.reviews.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-slate-900">对账记录</h2>
          <div className="space-y-3">
            {rec.reviews.map((r) => (
              <div key={r.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {r.reviewer.name.slice(0, 1)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{r.reviewer.name}</span>
                    <Badge className={REVIEW_ACTION_COLORS[r.action] + " text-xs"}>
                      {REVIEW_ACTION_LABELS[r.action] ?? r.action}
                    </Badge>
                    <span className="text-xs text-slate-400">{formatDateTime(r.createdAt)}</span>
                  </div>
                  {(r.disputedOrders != null || r.disputedSalesAmount != null) && (
                    <div className="mt-1 text-sm text-rose-600">
                      己方数据：单量 {r.disputedOrders ?? "—"} ·
                      销售额 ¥{r.disputedSalesAmount?.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) ?? "—"}
                    </div>
                  )}
                  {r.note && (
                    <p className="mt-1 text-sm text-slate-500">{r.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ④ 结算进度跟踪 */}
      {(isConfirmed || rec.settlements.length > 0) && (
        <SettlementSection settlements={rec.settlements} />
      )}

      {/* Modals */}
      {showReviewModal && (
        <ReviewModal
          recId={rec.id}
          action={reviewAction}
          onClose={() => setShowReviewModal(false)}
          onDone={() => { setShowReviewModal(false); startTransition(() => router.refresh()); }}
        />
      )}
      {showConfirmModal && (
        <ConfirmModal
          recId={rec.id}
          onClose={() => setShowConfirmModal(false)}
          onDone={() => { setShowConfirmModal(false); startTransition(() => router.refresh()); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Settlement Section
// ────────────────────────────────────────────────────────────────────────────
function SettlementSection({ settlements }: { settlements: Settlement[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function updateSettlement(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/finance/settlements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { alert((await res.json()).error ?? "更新失败"); return; }
    startTransition(() => router.refresh());
  }

  return (
    <section className="card p-5">
      <h2 className="mb-4 font-semibold text-slate-900">结算进度跟踪</h2>
      {settlements.length === 0 ? (
        <p className="text-sm text-slate-400">对账确认后将自动生成结算记录</p>
      ) : (
        <div className="space-y-4">
          {settlements.map((s) => (
            <SettlementRow key={s.id} settlement={s} onUpdate={(data) => updateSettlement(s.id, data)} />
          ))}
        </div>
      )}
    </section>
  );
}

function SettlementRow({
  settlement,
  onUpdate,
}: {
  settlement: Settlement;
  onUpdate: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [estimated, setEstimated] = useState(
    settlement.estimatedDate ? new Date(settlement.estimatedDate).toISOString().slice(0, 10) : "",
  );
  const [actual, setActual] = useState(
    settlement.actualDate ? new Date(settlement.actualDate).toISOString().slice(0, 10) : "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onUpdate({ estimatedDate: estimated || null, actualDate: actual || null });
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">
            {SETTLEMENT_TYPE_LABELS[settlement.type]}
          </span>
          <span className="text-sm font-semibold text-slate-900">
            ¥{settlement.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <Badge className={SETTLEMENT_STATUS_COLORS[settlement.status]}>
          {SETTLEMENT_STATUS_LABELS[settlement.status] ?? settlement.status}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">预计结算时间</label>
          <input
            type="date"
            className="input"
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
          />
        </div>
        <div>
          <label className="label">实际结算时间</label>
          <input
            type="date"
            className="input"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
          {actual && (
            <p className="mt-1 text-xs text-emerald-600">填写实际结算时间后自动标记已结算</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={save} disabled={saving} className="btn-secondary text-sm">
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
      {settlement.reminderSent && (
        <p className="mt-2 text-xs text-slate-400">✅ 结算提醒已创建（预计结算前1天提醒）</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Review Modal
// ────────────────────────────────────────────────────────────────────────────
function ReviewModal({
  recId,
  action,
  onClose,
  onDone,
}: {
  recId: string;
  action: "APPROVED" | "DISPUTED";
  onClose: () => void;
  onDone: () => void;
}) {
  const [disputedOrders, setDisputedOrders] = useState("");
  const [disputedSalesAmount, setDisputedSalesAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const body: Record<string, unknown> = { action, note };
    if (action === "DISPUTED") {
      if (disputedOrders) body.disputedOrders = Number(disputedOrders);
      if (disputedSalesAmount) body.disputedSalesAmount = Number(disputedSalesAmount);
    }
    const res = await fetch(`/api/finance/reconciliations/${recId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) { alert((await res.json()).error ?? "操作失败"); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {action === "APPROVED" ? "✅ 确认对账" : "⚠️ 提出异议"}
          </h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          {action === "DISPUTED" && (
            <>
              <div>
                <label className="label">己方实际单量</label>
                <input
                  type="number"
                  className="input"
                  placeholder="输入己方数据（可选）"
                  value={disputedOrders}
                  onChange={(e) => setDisputedOrders(e.target.value)}
                  min={0}
                />
              </div>
              <div>
                <label className="label">己方实际销售额（¥）</label>
                <input
                  type="number"
                  className="input"
                  placeholder="输入己方数据（可选）"
                  value={disputedSalesAmount}
                  onChange={(e) => setDisputedSalesAmount(e.target.value)}
                  min={0}
                  step="0.01"
                />
              </div>
            </>
          )}
          <div>
            <label className="label">备注</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="说明意见（可选）"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="btn-secondary">取消</button>
            <button
              onClick={submit}
              disabled={loading}
              className={action === "APPROVED" ? "btn-primary" : "btn-primary bg-rose-600 hover:bg-rose-700"}
            >
              {loading ? "处理中…" : action === "APPROVED" ? "确认" : "提交异议"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Confirm Modal (final confirm after dispute)
// ────────────────────────────────────────────────────────────────────────────
function ConfirmModal({
  recId,
  onClose,
  onDone,
}: {
  recId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await fetch(`/api/finance/reconciliations/${recId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setLoading(false);
    if (!res.ok) { alert((await res.json()).error ?? "确认失败"); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">最终确认对账</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            确认后将锁定当前数据并生成结算记录，不可修改
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="label">备注（可选）</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="btn-secondary">取消</button>
            <button onClick={submit} disabled={loading} className="btn-primary">
              {loading ? "确认中…" : "最终确认"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helper Components
// ────────────────────────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-700">{value || "—"}</dd>
    </div>
  );
}

function FieldNode({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
