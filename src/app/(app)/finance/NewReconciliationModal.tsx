"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTRACT_TYPE_LABELS } from "@/lib/constants";
import { clientUnknownError, readApiError } from "@/lib/clientError";
import { Modal } from "@/components/ui/Modal";

type Contract = {
  id: string;
  contractNo: string;
  type: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  feeCurrency: string | null;
  thresholdCurrency: string | null;
  betTargetCurrency: string | null;
  tieredRules: string | null;
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

type ReconcileType = "FEE_ONLY" | "COMMISSION_ONLY";

const CURRENCY_OPTIONS = ["USD", "CNY", "EUR", "GBP", "HKD", "JPY", "CAD", "AUD", "SGD"];

function normalizeCurrency(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (["美金", "美元", "US$", "$"].includes(normalized)) return "USD";
  if (["人民币", "人民币元", "RMB", "¥", "￥"].includes(normalized)) return "CNY";
  return normalized || "USD";
}

function defaultCommissionCurrency(contract: Contract | null | undefined) {
  try {
    const tiered = contract?.tieredRules
      ? JSON.parse(contract.tieredRules) as { currency?: string }
      : null;
    if (tiered?.currency) return normalizeCurrency(tiered.currency);
  } catch {
    // Invalid historical JSON falls back to the explicit contract fields.
  }
  return normalizeCurrency(
    contract?.thresholdCurrency || contract?.betTargetCurrency || contract?.feeCurrency,
  );
}

function dateInputValue(value: Date | string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function NewReconciliationModal({ customers, onCreated }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [reconcileTypes, setReconcileTypes] = useState<ReconcileType[]>([
    "FEE_ONLY",
    "COMMISSION_ONLY",
  ]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [fixedFeeCurrency, setFixedFeeCurrency] = useState("USD");
  const [commissionCurrency, setCommissionCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
    const customer = customers.find((item) => item.id === customerId);
    const onlyContract = customer?.contracts.length === 1 ? customer.contracts[0] : null;
    setSelectedContractId(onlyContract?.id ?? "");
    setPeriodStart(dateInputValue(onlyContract?.startDate ?? null));
    setPeriodEnd(dateInputValue(onlyContract?.endDate ?? null));
    setFixedFeeCurrency(normalizeCurrency(onlyContract?.feeCurrency));
    setCommissionCurrency(defaultCommissionCurrency(onlyContract));
    setError(null);
  }

  function handleContractChange(contractId: string) {
    setSelectedContractId(contractId);
    const contract = selectedCustomer?.contracts.find((item) => item.id === contractId);
    setPeriodStart(dateInputValue(contract?.startDate ?? null));
    setPeriodEnd(dateInputValue(contract?.endDate ?? null));
    setFixedFeeCurrency(normalizeCurrency(contract?.feeCurrency));
    setCommissionCurrency(defaultCommissionCurrency(contract));
    setError(null);
  }

  function toggleType(type: ReconcileType) {
    setReconcileTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  }

  function resetForm() {
    setSelectedCustomerId("");
    setSelectedContractId("");
    setReconcileTypes(["FEE_ONLY", "COMMISSION_ONLY"]);
    setPeriodStart("");
    setPeriodEnd("");
    setFixedFeeCurrency("USD");
    setCommissionCurrency("USD");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !selectedCustomerId ||
      !selectedContractId ||
      !periodStart ||
      !periodEnd ||
      reconcileTypes.length === 0
    ) {
      setError("请选择客户、合同并填写完整的对账周期");
      return;
    }
    if (periodEnd < periodStart) {
      setError("对账周期结束日期不能早于开始日期");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/finance/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          contractId: selectedContractId,
          reconcileTypes,
          periodStart,
          periodEnd,
          fixedFeeCurrency,
          commissionCurrency,
        }),
      });
      if (!response.ok) {
        setError(await readApiError(response, "创建客户对账失败"));
        return;
      }
      const created = (await response.json()) as { id: string };
      setOpen(false);
      resetForm();
      onCreated();
      router.push(`/finance/reconciliations/${created.id}`);
    } catch (cause) {
      console.error("[finance-reconciliation-create]", cause);
      setError(clientUnknownError());
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        + 新建对账
      </button>
      <Modal
        open={open}
        onClose={() => {
          if (loading) return;
          setOpen(false);
          resetForm();
        }}
        title="新建客户对账"
        description="在财务流程中选择客户和合同不会修改客户负责人或客户所属关系。"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">客户 *</label>
            <select
              className="input"
              value={selectedCustomerId}
              onChange={(event) => handleCustomerChange(event.target.value)}
              required
            >
              <option value="">请选择客户</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.brandName}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              显示系统内拥有已完成合同的有效客户
            </p>
          </div>

          <div>
            <label className="label">关联合同 *</label>
            <select
              className="input"
              value={selectedContractId}
              onChange={(event) => handleContractChange(event.target.value)}
              disabled={!selectedCustomer}
              required
            >
              <option value="">
                {selectedCustomer ? "请选择合同" : "请先选择客户"}
              </option>
              {selectedCustomer?.contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.contractNo}（
                  {CONTRACT_TYPE_LABELS[contract.type] ?? contract.type}）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">对账类型 *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={
                  reconcileTypes.includes("FEE_ONLY") ? "btn-primary" : "btn-secondary"
                }
                onClick={() => toggleType("FEE_ONLY")}
              >
                固费
              </button>
              <button
                type="button"
                className={
                  reconcileTypes.includes("COMMISSION_ONLY")
                    ? "btn-primary"
                    : "btn-secondary"
                }
                onClick={() => toggleType("COMMISSION_ONLY")}
              >
                销售佣金
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            默认同时创建固费与销售佣金计划；固费每 30 个自然日一期，销售佣金首期至当月月底、之后按自然月划分。
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">固费币种</label>
              <select
                className="input"
                value={fixedFeeCurrency}
                onChange={(event) => setFixedFeeCurrency(event.target.value)}
                disabled={!reconcileTypes.includes("FEE_ONLY")}
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">销售佣金币种</label>
              <select
                className="input"
                value={commissionCurrency}
                onChange={(event) => setCommissionCurrency(event.target.value)}
                disabled={!reconcileTypes.includes("COMMISSION_ONLY")}
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            默认读取合同中对应费用类型的币种，创建前可分别调整。
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">对账开始日期 *</label>
              <input
                type="date"
                className="input"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">对账结束日期 *</label>
              <input
                type="date"
                className="input"
                min={periodStart || undefined}
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              className="btn-secondary"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !selectedCustomerId ||
                !selectedContractId ||
                !periodStart ||
                !periodEnd ||
                reconcileTypes.length === 0
              }
              className="btn-primary"
            >
              {loading ? "创建中…" : "创建并进入对账"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
