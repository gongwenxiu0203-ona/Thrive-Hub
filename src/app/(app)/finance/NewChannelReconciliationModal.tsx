"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FEE_CURRENCY_OPTIONS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";

type Settlement = {
  id: string;
  type: string;
  status: string;
  amount: number;
  actualDate: Date | string | null;
};

export type ConfirmedCustomerRec = {
  id: string;
  customerId: string;
  contractId: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  feeAmount: number;
  commissionAmount: number;
  finalCommissionAmount: number | null;
  fixedFeeCurrency: string;
  commissionCurrency: string;
  customer: { id: string; brandName: string };
  contract: { id: string; contractNo: string };
  settlements: Settlement[];
};

type ChannelUser = { id: string; name: string };

type Props = {
  confirmedRecs: ConfirmedCustomerRec[];
  channelUsers: ChannelUser[];
  onCreated: () => void;
};

export function NewChannelReconciliationModal({
  confirmedRecs,
  channelUsers,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [contractId, setContractId] = useState("");
  const [customerReconciliationId, setCustomerReconciliationId] = useState("");
  const [channelUserId, setChannelUserId] = useState("");
  const [periodNo, setPeriodNo] = useState("1");
  const [fixedFeeShareRate, setFixedFeeShareRate] = useState("");
  const [fixedFeeShareCurrency, setFixedFeeShareCurrency] = useState("人民币");
  const [commissionShareRate, setCommissionShareRate] = useState("");
  const [commissionShareCurrency, setCommissionShareCurrency] =
    useState("人民币");
  const [note, setNote] = useState("");
  const router = useRouter();

  // 按客户聚合
  const customers = useMemo(() => {
    const map = new Map<string, { id: string; brandName: string }>();
    for (const r of confirmedRecs) {
      if (!map.has(r.customerId)) {
        map.set(r.customerId, r.customer);
      }
    }
    return [...map.values()].sort((a, b) =>
      a.brandName.localeCompare(b.brandName),
    );
  }, [confirmedRecs]);

  // 按客户筛选合同
  const contracts = useMemo(() => {
    if (!customerId) return [];
    const map = new Map<string, { id: string; contractNo: string }>();
    for (const r of confirmedRecs) {
      if (r.customerId === customerId && !map.has(r.contractId)) {
        map.set(r.contractId, r.contract);
      }
    }
    return [...map.values()];
  }, [confirmedRecs, customerId]);

  // 按客户 + 合同筛选月度对账
  const monthlyRecs = useMemo(() => {
    if (!customerId || !contractId) return [];
    return confirmedRecs.filter(
      (r) => r.customerId === customerId && r.contractId === contractId,
    );
  }, [confirmedRecs, customerId, contractId]);

  const selectedRec = monthlyRecs.find(
    (r) => r.id === customerReconciliationId,
  );

  // 预览到账金额（仅当对应 Settlement 已结算）
  const fixedFeeSettlement = selectedRec?.settlements.find(
    (s) => s.type === "FIXED_FEE",
  );
  const commissionSettlement = selectedRec?.settlements.find(
    (s) => s.type === "COMMISSION",
  );
  const fixedFeeReceived =
    fixedFeeSettlement?.status === "SETTLED" ? fixedFeeSettlement.amount : null;
  const commissionReceived =
    commissionSettlement?.status === "SETTLED"
      ? commissionSettlement.amount
      : null;

  function parsePct(s: string): number {
    if (!s) return 0;
    const n = Number(s.replace(/[%\s]/g, ""));
    if (!Number.isFinite(n)) return 0;
    return n > 1 ? n / 100 : n;
  }
  const fxRate = parsePct(fixedFeeShareRate);
  const cmRate = parsePct(commissionShareRate);
  const fxAmount = fixedFeeReceived != null ? fixedFeeReceived * fxRate : null;
  const cmAmount =
    commissionReceived != null ? commissionReceived * cmRate : null;

  function reset() {
    setCustomerId("");
    setContractId("");
    setCustomerReconciliationId("");
    setChannelUserId("");
    setPeriodNo("1");
    setFixedFeeShareRate("");
    setCommissionShareRate("");
    setNote("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !contractId || !channelUserId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/finance/channel-reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          contractId,
          customerReconciliationId: customerReconciliationId || undefined,
          channelUserId,
          periodNo: Number(periodNo) || 1,
          periodStart: selectedRec?.periodStart,
          periodEnd: selectedRec?.periodEnd,
          fixedFeeShareRate: fxRate,
          fixedFeeShareCurrency,
          commissionShareRate: cmRate,
          commissionShareCurrency,
          note,
        }),
      });
      if (!res.ok) {
        alert((await res.json()).error ?? "创建失败");
        return;
      }
      setOpen(false);
      reset();
      onCreated();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const fxSym = fixedFeeShareCurrency === "美金" ? "$" : "¥";
  const cmSym = commissionShareCurrency === "美金" ? "$" : "¥";

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary">
        + 新建渠道分账
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="新建渠道分账"
        wide
      >
        <div>
          <p className="mb-4 text-xs text-slate-500">
            关联已确认的客户月度对账，到账金额自动同步（未结算前显示「—」）
          </p>
          <form onSubmit={submit} className="space-y-4">
            {/* 客户 / 合同 / 月度对账 */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">客户 *</label>
                <select
                  className="input"
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setContractId("");
                    setCustomerReconciliationId("");
                  }}
                  required
                >
                  <option value="">请选择</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brandName}
                    </option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="mt-1 text-xs text-rose-500">
                    暂无已确认的客户对账，无法新建渠道分账
                  </p>
                )}
              </div>

              <div>
                <label className="label">关联合同 *</label>
                <select
                  className="input"
                  value={contractId}
                  onChange={(e) => {
                    setContractId(e.target.value);
                    setCustomerReconciliationId("");
                  }}
                  disabled={!customerId}
                  required
                >
                  <option value="">请选择</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.contractNo}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="label">关联月度对账 *</label>
                <select
                  className="input"
                  value={customerReconciliationId}
                  onChange={(e) => setCustomerReconciliationId(e.target.value)}
                  disabled={!contractId}
                  required
                >
                  <option value="">请选择月度对账周期</option>
                  {monthlyRecs.map((r) => {
                    const sym = r.commissionCurrency === "美金" ? "$" : "¥";
                    return (
                      <option key={r.id} value={r.id}>
                        {formatDate(r.periodStart)} ~ {formatDate(r.periodEnd)}
                        {`  ·  固费 ${sym}${r.feeAmount.toLocaleString()}  ·  抽佣 ${sym}${(r.finalCommissionAmount ?? r.commissionAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="label">渠道商 *</label>
                <select
                  className="input"
                  value={channelUserId}
                  onChange={(e) => setChannelUserId(e.target.value)}
                  required
                >
                  <option value="">请选择渠道商用户</option>
                  {channelUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">分账期数</label>
                <input
                  type="number"
                  className="input"
                  value={periodNo}
                  onChange={(e) => setPeriodNo(e.target.value)}
                  min={1}
                />
              </div>
            </div>

            {/* 待支付金额预览（来自客户对账） */}
            {selectedRec && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <p className="mb-1.5 font-medium text-slate-600">
                  客户对账确认数据（来源：{selectedRec.contract.contractNo}）
                </p>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>
                    待支付固费：
                    <strong className="text-slate-800">
                      {selectedRec.fixedFeeCurrency === "美金" ? "$" : "¥"}
                      {selectedRec.feeAmount.toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    待支付抽佣：
                    <strong className="text-slate-800">
                      {selectedRec.commissionCurrency === "美金" ? "$" : "¥"}
                      {(
                        selectedRec.finalCommissionAmount ??
                        selectedRec.commissionAmount
                      ).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div>
                    到账固费：
                    <strong
                      className={
                        fixedFeeReceived != null
                          ? "text-emerald-700"
                          : "text-slate-400"
                      }
                    >
                      {fixedFeeReceived != null
                        ? `${selectedRec.fixedFeeCurrency === "美金" ? "$" : "¥"}${fixedFeeReceived.toLocaleString()}`
                        : "— 待结算"}
                    </strong>
                  </div>
                  <div>
                    到账抽佣：
                    <strong
                      className={
                        commissionReceived != null
                          ? "text-emerald-700"
                          : "text-slate-400"
                      }
                    >
                      {commissionReceived != null
                        ? `${selectedRec.commissionCurrency === "美金" ? "$" : "¥"}${commissionReceived.toLocaleString()}`
                        : "— 待结算"}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* 固费分账设置 */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
              <p className="text-xs font-semibold text-emerald-800">
                固费分账设置
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label text-xs">固费分账比例 *</label>
                  <input
                    className="input"
                    placeholder="如 30%"
                    value={fixedFeeShareRate}
                    onChange={(e) => setFixedFeeShareRate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-xs">货币</label>
                  <select
                    className="input"
                    value={fixedFeeShareCurrency}
                    onChange={(e) => setFixedFeeShareCurrency(e.target.value)}
                  >
                    {FEE_CURRENCY_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">固费分账金额（预览）</label>
                  <input
                    className="input bg-slate-50"
                    readOnly
                    value={
                      fxAmount != null
                        ? `${fxSym}${fxAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                        : "— 待结算后自动计算"
                    }
                  />
                </div>
              </div>
            </div>

            {/* 抽佣分账设置 */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-3">
              <p className="text-xs font-semibold text-amber-800">
                抽佣分账设置
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label text-xs">抽佣分账比例 *</label>
                  <input
                    className="input"
                    placeholder="如 20%"
                    value={commissionShareRate}
                    onChange={(e) => setCommissionShareRate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-xs">货币</label>
                  <select
                    className="input"
                    value={commissionShareCurrency}
                    onChange={(e) => setCommissionShareCurrency(e.target.value)}
                  >
                    {FEE_CURRENCY_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">抽佣分账金额（预览）</label>
                  <input
                    className="input bg-slate-50"
                    readOnly
                    value={
                      cmAmount != null
                        ? `${cmSym}${cmAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                        : "— 待结算后自动计算"
                    }
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="label text-xs">备注（可选）</label>
              <textarea
                className="input resize-none text-sm"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                取消
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  loading ||
                  !customerId ||
                  !contractId ||
                  !customerReconciliationId ||
                  !channelUserId
                }
              >
                {loading ? "创建中…" : "创建分账"}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
