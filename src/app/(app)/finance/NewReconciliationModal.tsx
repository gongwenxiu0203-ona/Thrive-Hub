"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BET_TYPE_OPTIONS, BET_TYPE_LABELS } from "@/lib/constants";

type Contract = {
  id: string;
  contractNo: string;
  type: string;
  partyA: string | null;
  feeAmount: string | null;
  commissionRate: string | null;
  feeCycle: string | null;
  accountingPeriod: string | null;
  affiliateRule: string | null;
  paymentCycle: string | null;
};

type Customer = {
  id: string;
  brandName: string;
  contracts: Contract[];
};

type Props = {
  customers: Customer[];
  onCreated: () => void;
};

export function NewReconciliationModal({ customers, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [betType, setBetType] = useState("NONE");
  const [betOrderCount, setBetOrderCount] = useState("");
  const [betSalesAmount, setBetSalesAmount] = useState("");
  const router = useRouter();

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const selectedContract = selectedCustomer?.contracts.find((c) => c.id === selectedContractId);

  function handleCustomerChange(id: string) {
    setSelectedCustomerId(id);
    const cust = customers.find((c) => c.id === id);
    if (cust?.contracts.length === 1) {
      setSelectedContractId(cust.contracts[0].id);
    } else {
      setSelectedContractId("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId || !selectedContractId || !periodStart || !periodEnd) return;

    setLoading(true);
    try {
      const res = await fetch("/api/finance/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          contractId: selectedContractId,
          periodStart,
          periodEnd,
          betType,
          betOrderCount: betOrderCount ? Number(betOrderCount) : undefined,
          betSalesAmount: betSalesAmount ? Number(betSalesAmount) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "创建失败");
        return;
      }
      const created = await res.json();
      setOpen(false);
      resetForm();
      onCreated();
      router.push(`/finance/reconciliations/${created.id}`);
    } catch {
      alert("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setSelectedCustomerId("");
    setSelectedContractId("");
    setPeriodStart("");
    setPeriodEnd("");
    setBetType("NONE");
    setBetOrderCount("");
    setBetSalesAmount("");
  }

  const showOrderCount = betType === "ORDER_COUNT" || betType === "BOTH";
  const showSalesAmount = betType === "SALES_AMOUNT" || betType === "BOTH";

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        + 新建对账
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">新建客户对账</h2>
          <p className="mt-0.5 text-sm text-slate-500">仅显示已签署完成合同的客户</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* 客户选择 */}
          <div>
            <label className="label">客户 *</label>
            <select
              className="input"
              value={selectedCustomerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              required
            >
              <option value="">请选择客户</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.brandName}</option>
              ))}
            </select>
          </div>

          {/* 合同选择 */}
          {selectedCustomer && (
            <div>
              <label className="label">合同 *</label>
              <select
                className="input"
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
                required
              >
                <option value="">请选择合同</option>
                {selectedCustomer.contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contractNo}（{c.type === "BRAND" ? "品牌方" : c.type === "CHANNEL" ? "渠道商" : "返佣"}）
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 合同关键条款预览 */}
          {selectedContract && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="mb-1.5 font-medium text-slate-700">合同条款预览</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
                {selectedContract.partyA && <span>甲方：{selectedContract.partyA}</span>}
                {selectedContract.feeAmount && <span>固费：{selectedContract.feeAmount}</span>}
                {selectedContract.commissionRate && <span>抽佣：{selectedContract.commissionRate}</span>}
                {selectedContract.feeCycle && <span>固费周期：{selectedContract.feeCycle}</span>}
                {selectedContract.paymentCycle && <span>付款周期：{selectedContract.paymentCycle}</span>}
              </div>
            </div>
          )}

          {/* 对账周期 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">对账开始日期 *</label>
              <input
                type="date"
                className="input"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">对账结束日期 *</label>
              <input
                type="date"
                className="input"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </div>
          </div>

          {/* 对赌设置 */}
          <div>
            <label className="label">是否对赌</label>
            <select
              className="input"
              value={betType}
              onChange={(e) => setBetType(e.target.value)}
            >
              {BET_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{BET_TYPE_LABELS[opt]}</option>
              ))}
            </select>
          </div>

          {showOrderCount && (
            <div>
              <label className="label">对赌单量</label>
              <input
                type="number"
                className="input"
                placeholder="请输入对赌单量"
                value={betOrderCount}
                onChange={(e) => setBetOrderCount(e.target.value)}
                min={0}
              />
            </div>
          )}
          {showSalesAmount && (
            <div>
              <label className="label">对赌销售额（¥）</label>
              <input
                type="number"
                className="input"
                placeholder="请输入对赌销售额"
                value={betSalesAmount}
                onChange={(e) => setBetSalesAmount(e.target.value)}
                min={0}
                step="0.01"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setOpen(false); resetForm(); }}
              className="btn-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "创建中…" : "创建对账"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
