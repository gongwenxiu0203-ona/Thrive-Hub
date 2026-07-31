"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CircleAlert,
  FileText,
  Landmark,
  Store,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";

const CURRENCY_OPTIONS = ["USD", "RMB", "EUR", "GBP", "HKD"] as const;

export type ChannelSplitRuleOption = {
  id: string;
  ruleType: "A" | "B";
  splitEndDate: string;
  fixedFeeRate: number;
  commissionThresholdAmount: number;
  commissionThresholdCurrency: string;
  commissionBelowRate: number;
  commissionAtOrAboveRate: number;
};

export type ChannelReconciliationContractOption = {
  id: string;
  contractNo: string;
  startDate: string | null;
  endDate: string | null;
  feeCurrency: string | null;
};

export type ChannelReconciliationCustomerOption = {
  id: string;
  brandName: string;
  channelUser: { id: string; name: string } | null;
  splitRule: ChannelSplitRuleOption | null;
  contracts: ChannelReconciliationContractOption[];
};

function pct(value: number) {
  return `${(value * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function dateValue(value: string | null | undefined) {
  return value?.slice(0, 10) ?? "";
}

function normalizeCurrency(value: string | null | undefined) {
  if (value === "美金" || value === "美元") return "USD";
  if (value === "人民币" || value === "CNY") return "RMB";
  return CURRENCY_OPTIONS.includes(value as (typeof CURRENCY_OPTIONS)[number])
    ? value!
    : "USD";
}

export function NewChannelReconciliationModal({
  customers,
  existingCustomerIds,
  onCreated,
}: {
  customers: ChannelReconciliationCustomerOption[];
  existingCustomerIds: string[];
  onCreated: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [contractId, setContractId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [fixedFeeReceivedCurrency, setFixedFeeReceivedCurrency] = useState("USD");
  const [commissionReceivedCurrency, setCommissionReceivedCurrency] = useState("USD");
  const [note, setNote] = useState("");

  const selectable = useMemo(() => {
    const used = new Set(existingCustomerIds);
    return customers.filter((customer) => !used.has(customer.id));
  }, [customers, existingCustomerIds]);
  const selected = selectable.find((customer) => customer.id === customerId);
  const selectedContract = selected?.contracts.find((contract) => contract.id === contractId);
  const commissionCurrencyMismatch =
    selected?.splitRule?.ruleType === "A" &&
    commissionReceivedCurrency !== selected.splitRule.commissionThresholdCurrency;

  function applyContract(
    contract: ChannelReconciliationContractOption | undefined,
    customer: ChannelReconciliationCustomerOption | undefined,
  ) {
    setContractId(contract?.id ?? "");
    setPeriodStart(dateValue(contract?.startDate));
    setPeriodEnd(dateValue(contract?.endDate ?? customer?.splitRule?.splitEndDate));
    setFixedFeeReceivedCurrency(normalizeCurrency(contract?.feeCurrency));
  }

  function selectCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setError(null);
    const customer = selectable.find((item) => item.id === nextCustomerId);
    applyContract(customer?.contracts.length === 1 ? customer.contracts[0] : undefined, customer);
  }

  function reset() {
    setCustomerId("");
    setContractId("");
    setPeriodStart("");
    setPeriodEnd("");
    setFixedFeeReceivedCurrency("USD");
    setCommissionReceivedCurrency("USD");
    setNote("");
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected?.channelUser) return setError("该客户尚未关联已审核渠道商。");
    if (!selected.splitRule) return setError("该客户尚未配置分账规则。");
    if (!selectedContract) return setError("请选择关联合同。");
    if (!periodStart || !periodEnd) return setError("请填写分账开始和结束时间。");
    if (periodEnd < periodStart) return setError("分账结束时间不能早于开始时间。");
    if (commissionCurrencyMismatch) {
      return setError(
        `A 类佣金门槛按 ${selected.splitRule.commissionThresholdCurrency} 判断，请将到账销售佣金货币改为相同货币。`,
      );
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/finance/channel-reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          contractId,
          periodStart,
          periodEnd,
          fixedFeeReceivedCurrency,
          commissionReceivedCurrency,
          note: note.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error ?? "创建失败");
      setOpen(false);
      reset();
      onCreated();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        + 新建渠道商分账
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="新建渠道商分账"
        description="关联合同后，固费按合同合作日滚动生成 30 天服务周期；销售佣金按自然月生成。"
        size="lg"
      >
        <form onSubmit={submit} className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Store className="h-4 w-4 text-brand-600" />
              客户与合同
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">客户 *</label>
                <select
                  className="input"
                  value={customerId}
                  onChange={(event) => selectCustomer(event.target.value)}
                  required
                >
                  <option value="">请选择客户</option>
                  {selectable.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.brandName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">关联合同 *</label>
                <div className="relative">
                  <FileText className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <select
                    className="input pl-9"
                    value={contractId}
                    disabled={!selected || selected.contracts.length === 0}
                    onChange={(event) => {
                      const contract = selected?.contracts.find((item) => item.id === event.target.value);
                      applyContract(contract, selected);
                    }}
                    required
                  >
                    <option value="">
                      {!selected
                        ? "请先选择客户"
                        : selected.contracts.length === 0
                          ? "该客户暂无有效合同"
                          : "请选择合同"}
                    </option>
                    {selected?.contracts.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.contractNo}
                      </option>
                    ))}
                  </select>
                </div>
                {selected?.contracts.length === 1 && (
                  <p className="mt-1 text-xs text-emerald-600">已自动关联唯一有效合同</p>
                )}
                {selected && selected.contracts.length > 1 && (
                  <p className="mt-1 text-xs text-amber-600">检测到多份有效合同，请手动选择</p>
                )}
              </div>
              <div>
                <label className="label">渠道商（自动关联）</label>
                <input
                  className="input bg-white"
                  readOnly
                  value={selected?.channelUser?.name ?? "选择客户后显示"}
                />
              </div>
              <div>
                <label className="label">分账规则（自动关联）</label>
                <input
                  className="input bg-white"
                  readOnly
                  value={
                    !selected?.splitRule
                      ? "选择客户后显示"
                      : selected.splitRule.ruleType === "A"
                        ? `A 类：固费 ${pct(selected.splitRule.fixedFeeRate)}；佣金按到账金额分档`
                        : `B 类：固费 ${pct(selected.splitRule.fixedFeeRate)}；佣金按阶梯规则`
                  }
                />
              </div>
            </div>
            {selected && (!selected.channelUser || !selected.splitRule || selected.contracts.length === 0) && (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <CircleAlert className="h-4 w-4 shrink-0" />
                {!selected.channelUser
                  ? "客户未关联有效渠道商，暂不能创建。"
                  : !selected.splitRule
                    ? "客户未配置分账规则，暂不能创建。"
                    : "客户暂无有效合同，暂不能创建。"}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CalendarDays className="h-4 w-4 text-brand-600" />
              分账范围
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">开始时间 *</label>
                <input
                  type="date"
                  className="input"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-slate-400">默认读取合同开始合作时间，可手动更改</p>
              </div>
              <div>
                <label className="label">结束时间 *</label>
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
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Landmark className="h-4 w-4 text-brand-600" />
              到账金额货币
            </div>
            <p className="mb-3 text-xs text-slate-500">
              创建后各期金额始终沿用这里选择的货币。
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">到账固费货币 *</label>
                <select
                  className="input"
                  value={fixedFeeReceivedCurrency}
                  onChange={(event) => setFixedFeeReceivedCurrency(event.target.value)}
                >
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">到账销售佣金货币 *</label>
                <select
                  className="input"
                  value={commissionReceivedCurrency}
                  onChange={(event) => setCommissionReceivedCurrency(event.target.value)}
                >
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
                {commissionCurrencyMismatch && (
                  <p className="mt-1 text-xs text-amber-600">
                    A 类规则门槛货币为 {selected?.splitRule?.commissionThresholdCurrency}，
                    当前货币无法计算，请选择相同货币（通常为 USD）。
                  </p>
                )}
              </div>
            </div>
          </section>

          <div>
            <label className="label">备注</label>
            <textarea
              className="input min-h-20"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              取消
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={
                loading ||
                !selectedContract ||
                !selected?.channelUser ||
                !selected?.splitRule ||
                commissionCurrencyMismatch ||
                !periodStart ||
                !periodEnd
              }
            >
              {loading ? "创建中…" : "创建并生成期数"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
