"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CircleDollarSign,
  FileDown,
  Landmark,
  Plus,
  ReceiptText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  createInvoice,
  updateInvoice,
  type InvoiceDetail,
  type InvoiceDraftInput,
  type InvoiceFormOptions,
} from "@/actions/invoices";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type EditorItem = InvoiceDraftInput["items"][number] & {
  localId: string;
  autoDescription: boolean;
};

type InvoiceEditorProps = {
  options: InvoiceFormOptions;
  initialInvoice?: InvoiceDetail | null;
  canEdit?: boolean;
};

const DEFAULT_TERMS =
  "Terms & Conditions Our Account Information is as follows. Wire transfer only.";

const FEE_TYPE_LABELS: Record<string, string> = {
  MONTHLY_FEE: "月度服务费",
  SALES_COMMISSION: "销售佣金",
};

const PROMO_PLATFORM_OPTIONS = [
  "亚马逊（Amazon）",
  "独立站（DTC）",
  "沃尔玛（Walmart）",
] as const;

const TARGET_SITE_OPTIONS = [
  "美国站",
  "加拿大",
  "德国站",
  "英国站",
  "法国站",
  "西班牙",
  "意大利",
  "荷兰",
  "澳洲",
  "日本",
] as const;

const AFFILIATE_PLATFORM_OPTIONS = [
  "ACC",
  "Levanta",
  "Wayward",
  "PartnerBoost",
  "Impact",
  "Rakuten",
  "Webgains",
  "Awin",
] as const;

function localDate(date = new Date()) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function formatInvoiceDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function newItem(sortOrder = 0): EditorItem {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    feeType: "MONTHLY_FEE",
    description: "",
    promoPlatform: "",
    targetSite: "",
    affiliatePlatform: "",
    quantity: 1,
    unitPrice: 0,
    sortOrder,
    autoDescription: true,
  };
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

const MULTI_VALUE_SEPARATOR = "、";

function parseMultiValue(value: string | null | undefined) {
  return unique(String(value ?? "").split(/[、,，]\s*/));
}

function joinMultiValues(values: Array<string | null | undefined>) {
  return unique(values).join(MULTI_VALUE_SEPARATOR);
}

function composeDescription({
  customerName,
  promoPlatform,
  targetSite,
  affiliatePlatform,
  periodLabel,
  feeType,
}: {
  customerName: string;
  promoPlatform?: string | null;
  targetSite?: string | null;
  affiliatePlatform?: string | null;
  periodLabel: string;
  feeType: string;
}) {
  return unique([
    customerName,
    promoPlatform,
    targetSite,
    affiliatePlatform,
    periodLabel,
    FEE_TYPE_LABELS[feeType] ?? feeType,
  ]).join(" · ");
}

export function InvoiceEditor({
  options,
  initialInvoice,
  canEdit = true,
}: InvoiceEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = localDate();
  const initialDate = initialInvoice?.invoiceDate?.slice(0, 10) || today;
  const initialPeriodType = initialInvoice?.periodType ?? "MONTH";
  const initialPeriodLabel = initialInvoice?.periodLabel ?? today.slice(0, 7);
  const [invoiceId, setInvoiceId] = useState(initialInvoice?.id ?? "");
  const [invoiceNo, setInvoiceNo] = useState(initialInvoice?.invoiceNo ?? "");
  const [status, setStatus] = useState(initialInvoice?.status ?? "DRAFT");
  const [customerId, setCustomerId] = useState(initialInvoice?.customerId ?? "");
  const [contractIds, setContractIds] = useState<string[]>(
    initialInvoice?.contractIds?.length
      ? initialInvoice.contractIds
      : initialInvoice?.contractId
        ? [initialInvoice.contractId]
        : [],
  );
  const [accountsReceivableId, setAccountsReceivableId] = useState(
    initialInvoice?.accountsReceivableId ?? "",
  );
  const [invoiceDate, setInvoiceDate] = useState(initialDate);
  const [dueDate, setDueDate] = useState(
    initialInvoice?.dueDate?.slice(0, 10) || addDays(initialDate, 15),
  );
  const [periodType, setPeriodType] = useState<"MONTH" | "DATE_RANGE">(
    initialPeriodType as "MONTH" | "DATE_RANGE",
  );
  const [month, setMonth] = useState(
    initialPeriodType === "MONTH" ? initialPeriodLabel.slice(0, 7) : today.slice(0, 7),
  );
  const periodParts = initialPeriodType === "DATE_RANGE" ? initialPeriodLabel.split(" ~ ") : [];
  const [periodStart, setPeriodStart] = useState(periodParts[0] ?? "");
  const [periodEnd, setPeriodEnd] = useState(periodParts[1] ?? "");
  const [clientName, setClientName] = useState(initialInvoice?.clientName ?? "");
  const [clientAddress, setClientAddress] = useState(initialInvoice?.clientAddress ?? "");
  const [currency, setCurrency] = useState(initialInvoice?.currency ?? "USD");
  const [bankAccountKey, setBankAccountKey] = useState(initialInvoice?.bankAccountKey ?? "");
  const [bankSnapshot, setBankSnapshot] = useState(initialInvoice?.bankSnapshot ?? null);
  const [terms, setTerms] = useState(initialInvoice?.terms ?? DEFAULT_TERMS);
  const [items, setItems] = useState<EditorItem[]>(
    initialInvoice?.items?.length
      ? initialInvoice.items.map((item, index) => ({
          feeType: item.feeType
            ?? (initialInvoice.feeType === "SALES_COMMISSION"
              ? "SALES_COMMISSION"
              : "MONTHLY_FEE"),
          description: item.description,
          promoPlatform: item.promoPlatform ?? "",
          targetSite: item.targetSite ?? "",
          affiliatePlatform: item.affiliatePlatform ?? "",
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sortOrder: item.sortOrder ?? index,
          localId: item.id ?? `saved-${index}`,
          autoDescription: false,
        }))
      : [newItem()],
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedCustomer = options.customers.find((item) => item.id === customerId);
  const contractOptions = useMemo(
    () => options.contracts.filter((item) => item.customerId === customerId),
    [customerId, options.contracts],
  );
  const contractId = contractIds[0] ?? "";
  const selectedContracts = contractIds
    .map((id) => options.contracts.find((item) => item.id === id))
    .filter((item): item is InvoiceFormOptions["contracts"][number] => Boolean(item));
  const selectedContract = selectedContracts[0];
  const receivableOptions = useMemo(
    () => options.accountsReceivables.filter(
      (item) => item.customerId === customerId,
    ),
    [customerId, options.accountsReceivables],
  );
  const periodLabel = periodType === "MONTH"
    ? month
    : [periodStart, periodEnd].filter(Boolean).join(" ~ ");
  const total = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );

  const promoCandidates = unique([
    ...selectedContracts.flatMap((contract) => contract.platforms),
    ...PROMO_PLATFORM_OPTIONS,
  ]);
  const targetCandidates = unique([
    ...selectedContracts.flatMap((contract) => contract.targetSites),
    ...TARGET_SITE_OPTIONS,
  ]);
  const affiliateCandidates = unique([
    ...selectedContracts.flatMap((contract) => contract.affiliatePlatforms),
    ...AFFILIATE_PLATFORM_OPTIONS,
  ]);

  function rebuildDescriptions(
    nextItems: EditorItem[],
    force = false,
    context?: { customerName?: string; periodLabel?: string },
  ) {
    return nextItems.map((item) => (
      force || item.autoDescription
        ? {
            ...item,
            description: composeDescription({
              customerName: context?.customerName
                ?? selectedCustomer?.brandName
                ?? "",
              promoPlatform: item.promoPlatform,
              targetSite: item.targetSite,
              affiliatePlatform: item.affiliatePlatform,
              periodLabel: context?.periodLabel ?? periodLabel,
              feeType: item.feeType,
            }),
            autoDescription: true,
          }
        : item
    ));
  }

  function handleCustomerChange(nextId: string) {
    setCustomerId(nextId);
    setAccountsReceivableId("");
    const customer = options.customers.find((item) => item.id === nextId);
    const relatedContracts = options.contracts.filter((item) => item.customerId === nextId);
    setClientName(customer?.brandName ?? "");
    setItems((current) => rebuildDescriptions(
      current,
      false,
      { customerName: customer?.brandName ?? "" },
    ));
    if (relatedContracts.length === 1) {
      applyContracts([relatedContracts[0].id], customer?.brandName ?? "", nextId);
    } else {
      setContractIds([]);
      setClientAddress("");
      setBankAccountKey("");
      setBankSnapshot(null);
    }
  }

  function applyContracts(
    nextIds: string[],
    customerName = selectedCustomer?.brandName ?? "",
    scopeCustomerId = customerId,
  ) {
    const allowedIds = new Set(
      options.contracts
        .filter((contract) => contract.customerId === scopeCustomerId)
        .map((contract) => contract.id),
    );
    const orderedIds = Array.from(new Set(nextIds.filter((id) => allowedIds.has(id))));
    const contracts = orderedIds
      .map((id) => options.contracts.find((contract) => contract.id === id))
      .filter((contract): contract is InvoiceFormOptions["contracts"][number] => Boolean(contract));
    const primaryContract = contracts[0];
    const primaryChanged = contractIds[0] !== orderedIds[0];
    setContractIds(orderedIds);
    setAccountsReceivableId("");
    if (!primaryContract) {
      setBankAccountKey("");
      setBankSnapshot(null);
      return;
    }
    if (primaryChanged) {
      setClientName(primaryContract.partyACompany || customerName);
      setClientAddress(primaryContract.address ?? "");
      const firstBank = primaryContract.bankAccounts?.[0];
      setBankAccountKey(firstBank?.key ?? "");
      setBankSnapshot(firstBank ?? null);
    }
    const platforms = joinMultiValues(contracts.flatMap((contract) => contract.platforms));
    const sites = joinMultiValues(contracts.flatMap((contract) => contract.targetSites));
    const affiliates = joinMultiValues(contracts.flatMap((contract) => contract.affiliatePlatforms));
    setItems((current) => current.map((item) => {
      const nextItem = {
        ...item,
        promoPlatform: item.promoPlatform || platforms,
        targetSite: item.targetSite || sites,
        affiliatePlatform: item.affiliatePlatform || affiliates,
      };
      return nextItem.autoDescription
        ? {
            ...nextItem,
            description: composeDescription({
              customerName,
              promoPlatform: nextItem.promoPlatform,
              targetSite: nextItem.targetSite,
              affiliatePlatform: nextItem.affiliatePlatform,
              periodLabel,
              feeType: nextItem.feeType,
            }),
          }
        : nextItem;
    }));
  }

  function updateItem(localId: string, patch: Partial<EditorItem>) {
    setItems((current) => rebuildDescriptions(current.map((item) => (
      item.localId === localId ? { ...item, ...patch } : item
    ))));
  }

  function addItem() {
    setItems((current) => {
      const item = {
        ...newItem(current.length),
        promoPlatform: joinMultiValues(selectedContracts.flatMap((contract) => contract.platforms)),
        targetSite: joinMultiValues(selectedContracts.flatMap((contract) => contract.targetSites)),
        affiliatePlatform: joinMultiValues(selectedContracts.flatMap((contract) => contract.affiliatePlatforms)),
      };
      return [...current, ...rebuildDescriptions([item], true)];
    });
  }

  function validate() {
    if (!customerId) return "请选择关联客户。";
    if (!contractId) return "请选择关联合同。";
    if (!invoiceDate || !dueDate) return "请填写发票日期和付款截止日。";
    if (dueDate < invoiceDate) return "付款截止日不能早于 Invoice 日期。";
    if (!periodLabel) return "请填写费用期间。";
    if (periodType === "DATE_RANGE" && (!periodStart || !periodEnd || periodEnd < periodStart)) {
      return "费用结束日期不能早于开始日期。";
    }
    if (!clientName.trim()) return "请填写 BILL TO 客户名称。";
    if (!bankSnapshot) return "请选择收款账户。";
    if (!items.length || items.some((item) => !item.description.trim())) {
      return "每个项目明细都需要填写描述。";
    }
    if (items.some((item) => !["MONTHLY_FEE", "SALES_COMMISSION"].includes(item.feeType))) {
      return "请为每个项目选择费用类型。";
    }
    if (items.some((item) => Number(item.quantity) <= 0 || Number(item.unitPrice) < 0)) {
      return "项目数量必须大于 0，单价不能为负数。";
    }
    if (!Number.isFinite(total) || total <= 0) return "Invoice 总金额必须大于 0。";
    return "";
  }

  function makePayload(nextStatus: "DRAFT" | "ISSUED"): InvoiceDraftInput {
    return {
      customerId,
      contractId,
      contractIds,
      accountsReceivableId: accountsReceivableId || null,
      invoiceDate,
      dueDate,
      periodType,
      periodLabel,
      clientName: clientName.trim(),
      clientAddress: clientAddress.trim() || null,
      currency,
      bankAccountKey: bankAccountKey || null,
      bankSnapshot,
      terms: terms.trim() || null,
      status: nextStatus,
      items: items.map((item, index) => ({
        feeType: item.feeType,
        description: item.description.trim(),
        promoPlatform: item.promoPlatform?.trim() || null,
        targetSite: item.targetSite?.trim() || null,
        affiliatePlatform: item.affiliatePlatform?.trim() || null,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        sortOrder: index,
      })),
    };
  }

  function save(nextStatus: "DRAFT" | "ISSUED") {
    setError("");
    setSuccess("");
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    if (
      nextStatus === "ISSUED"
      && !window.confirm(`确认正式开具 ${invoiceNo || "这张 Invoice"}？开具后将不能直接修改。`)
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const result = invoiceId
          ? await updateInvoice(invoiceId, makePayload(nextStatus))
          : await createInvoice(makePayload(nextStatus));
        if (!result.ok || !result.id) {
          setError(result.error ?? "Invoice 保存失败，请稍后重试。");
          return;
        }
        setInvoiceId(result.id);
        setInvoiceNo(result.invoiceNo ?? invoiceNo);
        setStatus(nextStatus);
        setSuccess(nextStatus === "ISSUED" ? "Invoice 已开具。" : "草稿已保存。");
        router.replace(`/invoices/${result.id}`);
        router.refresh();
      } catch (saveError) {
        console.error("[invoice-editor] save failed", saveError);
        setError("Invoice 保存请求失败，请检查网络后重试。");
      }
    });
  }

  const bank = bankSnapshot as {
    label?: string;
    beneficiary?: string;
    bankName?: string;
    bankAddress?: string;
    swiftCode?: string;
    accountNo?: string;
  } | null;

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={() => router.push("/invoices")}
            aria-label="返回 Invoice 列表"
            className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">
                {invoiceNo ? `Invoice ${invoiceNo}` : "新建 Invoice"}
              </h1>
              <StatusBadge status={status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              选择客户与合同后，系统会自动带入开票抬头、业务字段和收款账户。
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {invoiceId && (
            <a
              href={`/api/invoices/${invoiceId}/pdf`}
              className="btn-secondary flex-1 sm:flex-none"
              target="_blank"
              rel="noreferrer"
            >
              <FileDown className="h-4 w-4" /> 下载 PDF
            </a>
          )}
          {canEdit && status === "DRAFT" && (
            <>
              <Button className="flex-1 sm:flex-none" loading={pending} onClick={() => save("DRAFT")}>
                保存草稿
              </Button>
              <Button
                variant="primary"
                className="flex-1 sm:flex-none"
                loading={pending}
                onClick={() => save("ISSUED")}
              >
                开具 Invoice
              </Button>
            </>
          )}
        </div>
      </header>

      {(error || success) && (
        <div
          role={error ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          {error || success}
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(460px,0.9fr)_minmax(620px,1.25fr)]">
        <fieldset disabled={!canEdit || status !== "DRAFT"} className="space-y-4 disabled:opacity-75">
          <EditorSection icon={Building2} title="关联与抬头">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="关联客户" required>
                <select
                  className="input"
                  value={customerId}
                  onChange={(event) => handleCustomerChange(event.target.value)}
                >
                  <option value="">请选择客户</option>
                  {options.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.brandName}</option>
                  ))}
                </select>
              </Field>
              <Field label="关联合同" required>
                <MultiContractSelect
                  value={contractIds}
                  options={contractOptions}
                  disabled={!customerId}
                  onChange={(nextIds) => applyContracts(nextIds)}
                />
              </Field>
              <Field label="关联应收账款">
                <select
                  className="input"
                  value={accountsReceivableId}
                  disabled={!contractIds.length}
                  onChange={(event) => setAccountsReceivableId(event.target.value)}
                >
                  <option value="">不关联</option>
                  {receivableOptions.map((receivable) => (
                    <option key={receivable.id} value={receivable.id}>{receivable.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice 编号">
                <input
                  className="input bg-slate-50 text-slate-500"
                  value={invoiceNo || "首次保存后自动生成"}
                  readOnly
                />
              </Field>
              <Field label="Invoice 日期" required>
                <input
                  type="date"
                  className="input"
                  value={invoiceDate}
                  onChange={(event) => {
                    setInvoiceDate(event.target.value);
                    setDueDate(addDays(event.target.value, 15));
                  }}
                />
              </Field>
              <Field label="付款截止日" required>
                <input
                  type="date"
                  className="input"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
              <Field label="BILL TO 客户名称" required className="sm:col-span-2">
                <input className="input" value={clientName} onChange={(event) => setClientName(event.target.value)} />
              </Field>
              <Field label="客户地址（可选）" className="sm:col-span-2">
                <input
                  className="input"
                  value={clientAddress}
                  onChange={(event) => setClientAddress(event.target.value)}
                  placeholder="合同甲方地址会自动带入，也可手动调整"
                />
              </Field>
            </div>
          </EditorSection>

          <EditorSection
            icon={CircleDollarSign}
            title="费用与项目明细"
            action={(
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setItems((current) => rebuildDescriptions(current, true))}
              >
                <RotateCcw className="h-3.5 w-3.5" /> 按规则重组描述
              </button>
            )}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="币种" required>
                <select className="input" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option value="USD">USD — 美元</option>
                  <option value="CNY">CNY — 人民币</option>
                  <option value="HKD">HKD — 港币</option>
                  <option value="EUR">EUR — 欧元</option>
                  <option value="GBP">GBP — 英镑</option>
                </select>
              </Field>
              <Field label="费用期间" required className="sm:col-span-2">
                <div className="mb-2 flex gap-2" role="group" aria-label="费用期间类型">
                  <button
                    type="button"
                    onClick={() => setPeriodType("MONTH")}
                    className={periodType === "MONTH" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                  >
                    按月份
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodType("DATE_RANGE")}
                    className={periodType === "DATE_RANGE" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                  >
                    按日期范围
                  </button>
                </div>
                {periodType === "MONTH" ? (
                  <input
                    type="month"
                    className="input"
                    value={month}
                    onChange={(event) => {
                      setMonth(event.target.value);
                      setItems((current) => rebuildDescriptions(
                        current,
                        false,
                        { periodLabel: event.target.value },
                      ));
                    }}
                  />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="date"
                      aria-label="费用开始日期"
                      className="input"
                      value={periodStart}
                      onChange={(event) => {
                        const nextStart = event.target.value;
                        setPeriodStart(nextStart);
                        setItems((current) => rebuildDescriptions(
                          current,
                          false,
                          { periodLabel: [nextStart, periodEnd].filter(Boolean).join(" ~ ") },
                        ));
                      }}
                    />
                    <input
                      type="date"
                      aria-label="费用结束日期"
                      className="input"
                      value={periodEnd}
                      onChange={(event) => {
                        const nextEnd = event.target.value;
                        setPeriodEnd(nextEnd);
                        setItems((current) => rebuildDescriptions(
                          current,
                          false,
                          { periodLabel: [periodStart, nextEnd].filter(Boolean).join(" ~ ") },
                        ));
                      }}
                    />
                  </div>
                )}
              </Field>
            </div>
            <div className="mt-5 space-y-3 border-t border-[#e7e0ef] pt-5">
              {items.map((item, index) => (
                <div key={item.localId} className="rounded-lg border border-[#e7e0ef] bg-[#fbfaff] p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">项目 {index + 1}</span>
                    <button
                      type="button"
                      disabled={items.length === 1}
                      onClick={() => setItems((current) => current.filter((entry) => entry.localId !== item.localId))}
                      aria-label={`删除项目 ${index + 1}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="费用类型" required>
                      <select
                        className="input"
                        value={item.feeType}
                        onChange={(event) => updateItem(item.localId, {
                          feeType: event.target.value as EditorItem["feeType"],
                        })}
                      >
                        <option value="MONTHLY_FEE">月度服务费</option>
                        <option value="SALES_COMMISSION">销售佣金</option>
                      </select>
                    </Field>
                    <Field label="推广平台">
                      <MultiEditableSelect
                        value={item.promoPlatform ?? ""}
                        onChange={(value) => updateItem(item.localId, { promoPlatform: value })}
                        options={promoCandidates}
                        placeholder="请选择推广平台"
                        customPlaceholder="手动输入其他推广平台"
                      />
                    </Field>
                    <Field label="目标站点">
                      <MultiEditableSelect
                        value={item.targetSite ?? ""}
                        onChange={(value) => updateItem(item.localId, { targetSite: value })}
                        options={targetCandidates}
                        placeholder="请选择目标站点"
                        customPlaceholder="手动输入其他目标站点"
                      />
                    </Field>
                    <Field label="联盟平台">
                      <MultiEditableSelect
                        value={item.affiliatePlatform ?? ""}
                        onChange={(value) => updateItem(item.localId, { affiliatePlatform: value })}
                        options={affiliateCandidates}
                        placeholder="请选择联盟平台"
                        customPlaceholder="手动输入其他联盟平台"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="数量">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="input"
                          value={item.quantity}
                          onChange={(event) => updateItem(item.localId, { quantity: Number(event.target.value) })}
                        />
                      </Field>
                      <Field label={`单价 (${currency})`}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input"
                          value={item.unitPrice}
                          onChange={(event) => updateItem(item.localId, { unitPrice: Number(event.target.value) })}
                        />
                      </Field>
                    </div>
                    <Field label="项目描述" required className="sm:col-span-2">
                      <textarea
                        className="input min-h-20 resize-y"
                        value={item.description}
                        onChange={(event) => updateItem(item.localId, {
                          description: event.target.value,
                          autoDescription: false,
                        })}
                        placeholder="客户/品牌 · 推广平台 · 目标站点 · 联盟平台 · 期间 · 费用类型"
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <Button
                className="w-full"
                onClick={addItem}
              >
                <Plus className="h-4 w-4" /> 增加项目
              </Button>
            </div>
          </EditorSection>

          <EditorSection icon={Landmark} title="银行账户与条款">
            <div className="space-y-3">
              <Field label="收款账户" required>
                <select
                  className="input"
                  value={bankAccountKey}
                  disabled={!selectedContracts.length}
                  onChange={(event) => {
                    setBankAccountKey(event.target.value);
                    setBankSnapshot(
                      options.bankAccounts.find((item) => item.key === event.target.value) ?? null,
                    );
                  }}
                >
                  <option value="">{selectedContracts.length ? "请选择收款账户" : "请先选择合同"}</option>
                  {options.bankAccounts.map((account) => (
                    <option key={account.key} value={account.key}>
                      {account.label}
                      {selectedContracts.some((contract) =>
                        contract.bankAccounts?.some((item) => item.key === account.key))
                        ? "（合同账户）"
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {bank && (
                <dl className="grid gap-x-4 gap-y-2 rounded-lg bg-[#faf8ff] p-3 text-xs sm:grid-cols-2">
                  <BankInfo label="收款人" value={bank.beneficiary} />
                  <BankInfo label="银行" value={bank.bankName} />
                  <BankInfo label="SWIFT" value={bank.swiftCode} />
                  <BankInfo label="账号" value={bank.accountNo} />
                </dl>
              )}
              <Field label="附加条款">
                <textarea className="input min-h-24 resize-y" value={terms} onChange={(event) => setTerms(event.target.value)} />
              </Field>
            </div>
          </EditorSection>
        </fieldset>

        <div className="xl:sticky xl:top-0">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <ReceiptText className="h-4 w-4 text-brand-600" /> Invoice 实时预览
            </div>
            <span className="text-xs text-slate-400">PDF 将使用相同内容</span>
          </div>
          <InvoicePreview
            invoiceNo={invoiceNo}
            invoiceDate={invoiceDate}
            dueDate={dueDate}
            clientName={clientName}
            clientAddress={clientAddress}
            currency={currency}
            items={items}
            total={total}
            terms={terms}
            bank={bank}
          />
        </div>
      </div>
    </div>
  );
}

function EditorSection({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof Building2;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7e0ef] bg-[#faf8ff] px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon className="h-4 w-4 text-brand-600" /> {title}
        </h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="label">
        {label}{required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function MultiContractSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string[];
  options: InvoiceFormOptions["contracts"];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const selectedLabels = value
    .map((id) => options.find((contract) => contract.id === id)?.contractNo)
    .filter((label): label is string => Boolean(label));

  function toggle(id: string) {
    onChange(
      value.includes(id)
        ? value.filter((item) => item !== id)
        : [...value, id],
    );
  }

  return (
    <details className="group relative">
      <summary
        className={cn(
          "input flex list-none items-center justify-between gap-2",
          disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : "cursor-pointer",
        )}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        <span className={selectedLabels.length ? "truncate text-slate-700" : "text-slate-400"}>
          {disabled
            ? "请先选择客户"
            : selectedLabels.length
              ? selectedLabels.join("、")
              : "请选择合同"}
        </span>
        <span className="shrink-0 text-xs text-slate-400 transition-transform group-open:rotate-180">▼</span>
      </summary>
      {!disabled && (
        <div className="absolute z-40 mt-1 w-full min-w-72 space-y-1 rounded-lg border border-[#dcd4e7] bg-white p-3 shadow-lg">
          {options.length ? options.map((contract) => (
            <label
              key={contract.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[#faf8ff]"
            >
              <input
                type="checkbox"
                checked={value.includes(contract.id)}
                onChange={() => toggle(contract.id)}
              />
              <span>{contract.contractNo}</span>
            </label>
          )) : (
            <div className="px-2 py-2 text-sm text-slate-400">该客户暂无有效合同</div>
          )}
        </div>
      )}
    </details>
  );
}

function MultiEditableSelect({
  value,
  options,
  placeholder,
  customPlaceholder,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  customPlaceholder: string;
  onChange: (value: string) => void;
}) {
  const [customValue, setCustomValue] = useState("");
  const selected = parseMultiValue(value);
  const customSelected = selected.filter((item) => !options.includes(item));

  function toggle(option: string) {
    onChange(joinMultiValues(
      selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option],
    ));
  }

  function addCustomValue() {
    const next = customValue.trim();
    if (!next) return;
    onChange(joinMultiValues([...selected, next]));
    setCustomValue("");
  }

  return (
    <details className="group relative">
      <summary className="input flex cursor-pointer list-none items-center justify-between gap-2">
        <span className={selected.length ? "truncate text-slate-700" : "text-slate-400"}>
          {selected.length ? selected.join("、") : placeholder}
        </span>
        <span className="shrink-0 text-xs text-slate-400 transition-transform group-open:rotate-180">▼</span>
      </summary>
      <div className="absolute z-30 mt-1 w-full min-w-60 space-y-2 rounded-lg border border-[#dcd4e7] bg-white p-3 shadow-lg">
        <div className="max-h-52 space-y-1 overflow-y-auto">
          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[#faf8ff]"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
              />
              <span>{option}</span>
            </label>
          ))}
          {customSelected.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[#faf8ff]"
            >
              <input type="checkbox" checked onChange={() => toggle(option)} />
              <span>{option}（手动新增）</span>
            </label>
          ))}
        </div>
        <div className="border-t border-[#eee8f5] pt-2">
          <div className="mb-1 text-xs font-medium text-slate-500">其他（手动新增）</div>
          <div className="flex gap-2">
            <input
              className="input min-w-0 flex-1"
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomValue();
                }
              }}
              placeholder={customPlaceholder}
            />
            <Button size="sm" onClick={addCustomValue} disabled={!customValue.trim()}>
              添加
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}

function BankInfo({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-all font-medium text-slate-700">{value || "—"}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = status === "ISSUED"
    ? "bg-emerald-100 text-emerald-700"
    : status === "VOID"
      ? "bg-slate-200 text-slate-600"
      : "bg-amber-100 text-amber-700";
  const label = status === "ISSUED" ? "已开具" : status === "VOID" ? "已作废" : "草稿";
  return <span className={cn("badge", styles)}>{label}</span>;
}

function InvoicePreview({
  invoiceNo,
  invoiceDate,
  dueDate,
  clientName,
  clientAddress,
  currency,
  items,
  total,
  terms,
  bank,
}: {
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  clientName: string;
  clientAddress: string;
  currency: string;
  items: EditorItem[];
  total: number;
  terms: string;
  bank: {
    beneficiary?: string;
    bankName?: string;
    bankAddress?: string;
    swiftCode?: string;
    accountNo?: string;
  } | null;
}) {
  return (
    <article className="min-h-[760px] overflow-x-auto rounded-lg border border-[#dcd4e7] bg-white">
      <div className="min-w-[660px] p-8 font-serif text-[13px] leading-5 text-slate-950 sm:p-10">
        <header className="flex items-center justify-between border-b-2 border-slate-950 pb-4">
          <div className="flex items-center gap-3">
            <img src="/thraive-logo.png" alt="Thraive" className="h-16 w-16 object-contain" />
            <div className="max-w-[270px] font-sans text-sm font-semibold leading-5 text-slate-800">
              {bank?.beneficiary || "HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED"}
            </div>
          </div>
          <div className="text-3xl font-bold tracking-[0.08em]">INVOICE</div>
        </header>

        <div className="grid grid-cols-[1fr_1.35fr] gap-8 py-6">
          <div>
            <p className="font-bold">BILL TO {clientName || "—"}</p>
            {clientAddress && <p className="mt-1 text-xs leading-5 text-slate-700">{clientAddress}</p>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-xs">
            <dt className="font-bold">Invoice Number:</dt>
            <dd className="text-right">{invoiceNo || "Pending"}</dd>
            <dt className="font-bold">Invoice Date:</dt>
            <dd className="text-right">{formatInvoiceDate(invoiceDate)}</dd>
            <dt className="font-bold">Payment Due:</dt>
            <dd className="text-right">{formatInvoiceDate(dueDate)}</dd>
            <dt className="font-bold">Amount Due ({currency}):</dt>
            <dd className="text-right font-bold">{money(total, currency)}</dd>
          </dl>
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-slate-500 px-3 py-2 text-left">Items</th>
              <th className="w-20 border border-slate-500 px-3 py-2 text-center">Quantity</th>
              <th className="w-28 border border-slate-500 px-3 py-2 text-right">Price</th>
              <th className="w-28 border border-slate-500 px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const amount = Number(item.quantity) * Number(item.unitPrice);
              return (
                <tr key={item.localId}>
                  <td className="border border-slate-500 px-3 py-2">{item.description || "—"}</td>
                  <td className="border border-slate-500 px-3 py-2 text-center">{item.quantity}</td>
                  <td className="border border-slate-500 px-3 py-2 text-right">{money(item.unitPrice, currency)}</td>
                  <td className="border border-slate-500 px-3 py-2 text-right">{money(amount, currency)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="border border-slate-500 px-3 py-2 text-right font-bold">Total:</td>
              <td className="border border-slate-500 px-3 py-2 text-right font-bold">{money(total, currency)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 border-t border-dashed border-slate-400 py-4 text-right text-base font-bold">
          Amount Due ({currency}): {money(total, currency)}
        </div>

        <section className="border-t border-slate-300 py-4">
          <h3 className="font-bold"># Notes / Terms</h3>
          <p className="mt-2 whitespace-pre-wrap text-xs">{terms || "—"}</p>
        </section>

        <section className="mt-2 text-xs leading-5">
          <h3 className="font-bold">Wire Instruction</h3>
          <p><strong>BENEFICIARY:</strong> {bank?.beneficiary || "—"}</p>
          <p><strong>Bank Name:</strong> {bank?.bankName || "—"}</p>
          {bank?.bankAddress && <p><strong>Bank Address:</strong> {bank.bankAddress}</p>}
          <p><strong>Swift Code:</strong> {bank?.swiftCode || "—"}</p>
          <p><strong>Account no.:</strong> {bank?.accountNo || "—"}</p>
        </section>

        <p className="mt-5 border-t border-slate-300 pt-3 text-[10px] text-slate-600">
          This is a Proforma Invoice for digital marketing consulting estimation.
          Final commercial invoice will be issued upon payment.
        </p>
      </div>
    </article>
  );
}
