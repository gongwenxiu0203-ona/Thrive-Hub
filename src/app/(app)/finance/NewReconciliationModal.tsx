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

function dateInputValue(value: Date | string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function NewReconciliationModal({ customers, onCreated }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);
  const [reconcileTypes, setReconcileTypes] = useState<ReconcileType[]>([
    "FEE_ONLY",
    "COMMISSION_ONLY",
  ]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );
  const selectedContracts = useMemo(
    () => selectedCustomer?.contracts.filter((contract) => selectedContractIds.includes(contract.id)) ?? [],
    [selectedCustomer, selectedContractIds],
  );
  const isSingleContract = selectedContracts.length === 1;

  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
    const customer = customers.find((item) => item.id === customerId);
    const onlyContract = customer?.contracts.length === 1 ? customer.contracts[0] : null;
    setSelectedContractIds(onlyContract ? [onlyContract.id] : []);
    setPeriodStart(dateInputValue(onlyContract?.startDate ?? null));
    setPeriodEnd(dateInputValue(onlyContract?.endDate ?? null));
    setError(null);
  }

  function toggleContract(contractId: string) {
    setSelectedContractIds((current) => {
      const next = current.includes(contractId)
        ? current.filter((id) => id !== contractId)
        : [...current, contractId];
      const onlyContract = next.length === 1
        ? selectedCustomer?.contracts.find((item) => item.id === next[0])
        : null;
      setPeriodStart(dateInputValue(onlyContract?.startDate ?? null));
      setPeriodEnd(dateInputValue(onlyContract?.endDate ?? null));
      return next;
    });
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
    setSelectedContractIds([]);
    setReconcileTypes(["FEE_ONLY", "COMMISSION_ONLY"]);
    setPeriodStart("");
    setPeriodEnd("");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !selectedCustomerId ||
      selectedContractIds.length === 0 ||
      (isSingleContract && (!periodStart || !periodEnd)) ||
      reconcileTypes.length === 0
    ) {
      setError("请选择客户、合同并填写完整的对账周期");
      return;
    }
    if (
      selectedCustomer &&
      selectedContractIds.length > 1 &&
      selectedContractIds.length !== selectedCustomer.contracts.length
    ) {
      setError("同时创建多合同对账时，需要选择该客户的全部合同；也可以只选择其中一份合同。");
      return;
    }
    if (isSingleContract && periodEnd < periodStart) {
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
          contractIds: selectedContractIds,
          ...(isSingleContract
            ? {
                contractId: selectedContractIds[0],
                periodStart,
                periodEnd,
              }
            : {}),
          reconcileTypes,
        }),
      });
      if (!response.ok) {
        setError(await readApiError(response, "创建客户对账失败"));
        return;
      }
      await response.json();
      setOpen(false);
      resetForm();
      onCreated();
      router.push(`/finance/customers/${selectedCustomerId}`);
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
            {!selectedCustomer ? (
              <div className="input flex items-center text-slate-400">请先选择客户</div>
            ) : selectedCustomer.contracts.length === 1 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <div className="text-sm font-medium text-emerald-900">
                  {selectedCustomer.contracts[0].contractNo}
                </div>
                <div className="mt-0.5 text-xs text-emerald-700">
                  {CONTRACT_TYPE_LABELS[selectedCustomer.contracts[0].type] ?? selectedCustomer.contracts[0].type} · 唯一合同，已自动关联
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <span className="text-xs text-slate-500">可选择一份，或全选该客户的全部合同</span>
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                    onClick={() => {
                      const allIds = selectedCustomer.contracts.map((item) => item.id);
                      setSelectedContractIds(selectedContractIds.length === allIds.length ? [] : allIds);
                      setPeriodStart("");
                      setPeriodEnd("");
                    }}
                  >
                    {selectedContractIds.length === selectedCustomer.contracts.length ? "取消全选" : "全选合同"}
                  </button>
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto p-2">
                  {selectedCustomer.contracts.map((contract) => (
                    <label key={contract.id} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        checked={selectedContractIds.includes(contract.id)}
                        onChange={() => toggleContract(contract.id)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800">{contract.contractNo}</span>
                        <span className="block text-xs text-slate-500">
                          {CONTRACT_TYPE_LABELS[contract.type] ?? contract.type} · {dateInputValue(contract.startDate)} 至 {dateInputValue(contract.endDate)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  已选择 {selectedContractIds.length} 份合同
                </div>
              </div>
            )}
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

          <p className="text-xs text-slate-500">
            创建后自动设置：固费采用合同月度服务费币种，销售佣金采用 USD；可在对账详情页随时修改。
          </p>

          {isSingleContract ? <div className="grid grid-cols-2 gap-3">
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
          </div> : selectedContractIds.length > 1 ? (
            <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
              多合同将分别采用各合同自身的开始、结束日期，并按现有固费和销售佣金周期规则生成。
            </div>
          ) : null}

          {selectedCustomer && selectedContractIds.length > 1 && selectedContractIds.length !== selectedCustomer.contracts.length && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              多合同模式需要选中该客户的全部合同，当前还差 {selectedCustomer.contracts.length - selectedContractIds.length} 份。
            </p>
          )}

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
                selectedContractIds.length === 0 ||
                Boolean(selectedCustomer && selectedContractIds.length > 1 && selectedContractIds.length !== selectedCustomer.contracts.length) ||
                (isSingleContract && (!periodStart || !periodEnd)) ||
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
