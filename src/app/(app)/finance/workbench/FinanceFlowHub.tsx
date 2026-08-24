"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Building2,
  FileText,
  Plus,
  Receipt,
  Trash2,
  WalletCards,
} from "lucide-react";
import {
  createExpenseClaim,
  createSupplierAndPaymentRequest,
  decideFinanceRequest,
  saveFinanceAccountProfile,
  submitManualBillingRequest,
  type ManualBillingItemInput,
} from "@/actions/financeUnified";

export type FinanceObjectOption = {
  id: string;
  label: string;
  subtitle?: string;
  customerId?: string;
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  currency?: string;
  bankAddress?: string;
  payeeAddress?: string;
  routingNumber?: string;
  note?: string;
  swiftCode?: string;
  editable?: boolean;
  taxNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  promoPlatforms?: string[];
  targetSites?: string[];
  affiliatePlatforms?: string[];
  receivingAccounts?: Array<{ key: string; label: string }>;
};
export type FinanceProgressRow = {
  id: string;
  requestNo: string;
  objectName: string;
  detail: string;
  currency: string;
  amount: number;
  status: string;
  rejectionReason?: string | null;
  paymentProofUrls?: string[];
  steps?: Array<{
    label: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    assignee?: string;
  }>;
};
export type FinanceFlowHubData = {
  customers: FinanceObjectOption[];
  contracts: FinanceObjectOption[];
  companyEntities: FinanceObjectOption[];
  payerAccounts: FinanceObjectOption[];
  payeeAccounts: FinanceObjectOption[];
  billingRequests: FinanceObjectOption[];
  receipts: FinanceObjectOption[];
  financeProfiles: Array<FinanceObjectOption & { category: ProfileCategory }>;
  customerOptions?: FinanceObjectOption[];
  channelAccountOptions?: FinanceObjectOption[];
  employeeAccountOptions?: FinanceObjectOption[];
  affiliateOptions?: FinanceObjectOption[];
  billingProgress?: FinanceProgressRow[];
  paymentProgress?: FinanceProgressRow[];
  expenseProgress?: FinanceProgressRow[];
};
export type ProfileCategory =
  | "CUSTOMER_BILLING"
  | "COMPANY_PAYER"
  | "SUPPLIER_PAYEE"
  | "CHANNEL_PAYEE"
  | "AFFILIATE_PAYEE"
  | "EMPLOYEE_REIMBURSEMENT";
type Module = "HOME" | "BILLING" | "PAYMENT" | "EXPENSE" | "PROFILE";
type SubmitKind = "BILLING" | "PAYMENT" | "EXPENSE" | "PROFILE";

const profileLabels: Record<ProfileCategory, string> = {
  CUSTOMER_BILLING: "客户开票资料",
  COMPANY_PAYER: "公司付款账户",
  SUPPLIER_PAYEE: "供应商收款账户",
  CHANNEL_PAYEE: "渠道商收款账户",
  AFFILIATE_PAYEE: "联盟商收款账户",
  EMPLOYEE_REIMBURSEMENT: "个人报销账户",
};
const emptyLine = () => ({
  key: crypto.randomUUID(),
  feeType: "MONTHLY_FEE",
  quantity: "1",
  unitPrice: "",
  currency: "USD",
  taxRate: "1",
  months: [] as string[],
  promoPlatform: "",
  targetSite: "",
  affiliatePlatform: "",
  remark: "",
});

export function FinanceFlowHub({
  data,
  canEdit,
}: {
  data: FinanceFlowHubData;
  canEdit: boolean;
}) {
  const [module, setModule] = useState<Module>("HOME");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(kind: SubmitKind, payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      let result: { ok: boolean; error?: string };
      if (kind === "BILLING")
        result = await submitManualBillingRequest(
          payload as Parameters<typeof submitManualBillingRequest>[0],
        );
      else if (kind === "PAYMENT")
        result = await createSupplierAndPaymentRequest(
          payload as Parameters<typeof createSupplierAndPaymentRequest>[0],
        );
      else if (kind === "EXPENSE")
        result = await createExpenseClaim(
          payload as Parameters<typeof createExpenseClaim>[0],
        );
      else
        result = await saveFinanceAccountProfile(
          payload as Parameters<typeof saveFinanceAccountProfile>[0],
        );
      setMessage(
        result.ok ? "已提交到财务流程。" : (result.error ?? "提交失败。"),
      );
    } finally {
      setBusy(false);
    }
  }
  if (module === "HOME")
    return (
      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">发起财务流程</h2>
          <p className="mt-1 text-sm text-slate-500">
            先选择业务类型，再填写紧凑的财务申请表。
          </p>
        </div>
        <div className="grid md:grid-cols-2">
          <Entry
            icon={<FileText />}
            title="开票申请"
            detail="国内发票或 Invoice"
            onClick={() => setModule("BILLING")}
          />
          <Entry
            icon={<WalletCards />}
            title="付款申请"
            detail="供应商、渠道商、联盟商及其他付款"
            onClick={() => setModule("PAYMENT")}
          />
          <Entry
            icon={<Receipt />}
            title="费用报销"
            detail="费用、票据与员工收款账户"
            onClick={() => setModule("EXPENSE")}
          />
          <Entry
            icon={<Building2 />}
            title="财务资料"
            detail="五类开票及收付款账户资料"
            onClick={() => setModule("PROFILE")}
          />
        </div>
      </section>
    );
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start gap-3 border-b border-slate-100 p-5">
        <button
          className="btn-secondary"
          onClick={() => {
            setModule("HOME");
            setMessage("");
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <div>
          <h2 className="font-semibold text-slate-900">
            {module === "BILLING"
              ? "开票申请"
              : module === "PAYMENT"
                ? "付款申请"
                : module === "EXPENSE"
                  ? "费用报销"
                  : "财务资料"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            优先选择系统已有对象与账户，找不到时再补充新资料。
          </p>
        </div>
      </div>
      {message && (
        <p className="mx-5 mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      )}
      {module === "BILLING" && (
        <>
          <BillingForm
            data={data}
            disabled={!canEdit || busy}
            onSubmit={(payload) => submit("BILLING", payload)}
          />
          <ProgressTable
            kind="BILLING_REQUEST"
            rows={data.billingProgress ?? []}
          />
        </>
      )}
      {module === "PAYMENT" && (
        <>
          <PaymentForm
            data={data}
            disabled={!canEdit || busy}
            onSubmit={(payload) => submit("PAYMENT", payload)}
          />
          <ProgressTable
            kind="PAYMENT_REQUEST"
            rows={data.paymentProgress ?? []}
          />
        </>
      )}
      {module === "EXPENSE" && (
        <>
          <ExpenseForm
            data={data}
            disabled={!canEdit || busy}
            onSubmit={(payload) => submit("EXPENSE", payload)}
          />
          <ProgressTable
            kind="EXPENSE_CLAIM"
            rows={data.expenseProgress ?? []}
          />
        </>
      )}
      {module === "PROFILE" && (
        <ProfileForm
          data={data}
          disabled={!canEdit || busy}
          onSubmit={(payload) => submit("PROFILE", payload)}
        />
      )}
    </section>
  );
}

function BillingForm({ data, disabled, onSubmit }: FormProps) {
  const initialInvoiceDate = new Date().toISOString().slice(0, 10);
  const initialDueDate = new Date(`${initialInvoiceDate}T00:00:00`);
  initialDueDate.setDate(initialDueDate.getDate() + 15);
  const [type, setType] = useState<"DOMESTIC" | "INVOICE" | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [contractId, setContractId] = useState("");
  const [billingProfileId, setBillingProfileId] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [lines, setLines] = useState([emptyLine()]);
  const [invoiceKind, setInvoiceKind] = useState("NORMAL");
  const [bankAccountKey, setBankAccountKey] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(initialInvoiceDate);
  const [dueDate, setDueDate] = useState(initialDueDate.toISOString().slice(0, 10));
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [terms, setTerms] = useState(
    "Terms & Conditions Our Account Information is as follows. Wire transfer only.",
  );
  const customerProfiles = data.financeProfiles.filter(
    (row) =>
      row.category === "CUSTOMER_BILLING" &&
      (!row.customerId || row.customerId === customerId),
  );
  const billingProfile = customerProfiles.find(
    (row) => row.id === billingProfileId,
  );
  const contracts = customerId
    ? data.contracts.filter((row) => row.customerId === customerId)
    : [];
  const selectedContract = contracts.find((row) => row.id === contractId);
  const total = useMemo(
    () =>
      lines.reduce((sum, row) => {
        const untaxed = Number(row.quantity || 0) * Number(row.unitPrice || 0);
        return sum + untaxed * (1 + Number(row.taxRate || 0) / 100);
      }, 0),
    [lines],
  );
  if (!type)
    return (
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Choice
          title="国内发票"
          detail="填写抬头、税号、开户信息及多条含税明细"
          onClick={() => {
            setType("DOMESTIC");
            setCurrency("CNY");
            setLines((rows) => rows.map((row) => ({ ...row, currency: "CNY" })));
          }}
        />
        <Choice
          title="Invoice"
          detail="填写与正式 Invoice 一致的业务字段，审核后由财务预填开具"
          onClick={() => {
            setType("INVOICE");
            setCurrency("USD");
            setLines((rows) => rows.map((row) => ({ ...row, currency: "USD" })));
          }}
        />
      </div>
    );
  const patchLine = (
    key: string,
    patch: Partial<ReturnType<typeof emptyLine>>,
  ) =>
    setLines((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center justify-between">
        <button
          className="text-sm font-medium text-brand-700"
          onClick={() => setType(null)}
        >
          ← 重选票据类型
        </button>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">
          {type === "DOMESTIC" ? "国内发票" : "Invoice"}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SelectField
          label="客户"
          value={customerId}
          setValue={(v) => {
            setCustomerId(v);
            setClientName(data.customers.find((row) => row.id === v)?.label ?? "");
            setClientAddress("");
            setContractId("");
            setBillingProfileId("");
          }}
          options={data.customers}
        />
        <SelectField
          label={type === "INVOICE" ? "合同（必填）" : "合同（可选）"}
          value={contractId}
          setValue={(value) => {
            setContractId(value);
            const contract = contracts.find((row) => row.id === value);
            setClientAddress(contract?.address ?? "");
            setBankAccountKey(contract?.receivingAccounts?.[0]?.key ?? "");
            setLines((rows) =>
              rows.map((row) => ({
                ...row,
                promoPlatform: contract?.promoPlatforms?.[0] ?? "",
                targetSite: contract?.targetSites?.[0] ?? "",
                affiliatePlatform: contract?.affiliatePlatforms?.[0] ?? "",
              })),
            );
          }}
          options={contracts}
        />
        {type === "INVOICE" ? (
          <Field label="币种">
            <select
              className="input"
              value={currency}
              onChange={(event) => {
                const nextCurrency = event.target.value;
                setCurrency(nextCurrency);
                setLines((rows) =>
                  rows.map((row) => ({ ...row, currency: nextCurrency })),
                );
              }}
            >
              <option value="USD">USD — 美元</option>
              <option value="CNY">CNY — 人民币</option>
              <option value="HKD">HKD — 港币</option>
              <option value="EUR">EUR — 欧元</option>
              <option value="GBP">GBP — 英镑</option>
            </select>
          </Field>
        ) : (
          <TextField label="币种" value={currency} setValue={setCurrency} />
        )}
        {type === "DOMESTIC" && (
          <>
            <SelectField
              label="客户开票资料（必选）"
              value={billingProfileId}
              setValue={setBillingProfileId}
              options={customerProfiles}
            />
            <Field label="发票类型">
              <select
                className="input"
                value={invoiceKind}
                onChange={(e) => setInvoiceKind(e.target.value)}
              >
                <option value="SPECIAL">增值税专用发票</option>
                <option value="NORMAL">增值税普通发票</option>
              </select>
            </Field>
            {billingProfile && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 md:col-span-3">
                <strong className="text-slate-800">
                  {billingProfile.accountName ?? billingProfile.label}
                </strong>
                <span className="ml-3">
                  税号 {billingProfile.taxNumber ?? "—"}
                </span>
                <span className="ml-3">
                  开户行 {billingProfile.bankName ?? "—"}
                </span>
                <span className="ml-3">
                  账号 {billingProfile.accountNumber ?? "—"}
                </span>
                <span className="ml-3">
                  地址 {billingProfile.address ?? "—"}
                </span>
              </div>
            )}
          </>
        )}
        {type === "INVOICE" && (
          <Field label="收款账户（必填）">
            <select
              className="input"
              value={bankAccountKey}
              disabled={!contractId}
              onChange={(event) => setBankAccountKey(event.target.value)}
            >
              <option value="">
                {contractId ? "请选择收款账户" : "请先选择合同"}
              </option>
              {(selectedContract?.receivingAccounts ?? []).map((account) => (
                <option key={account.key} value={account.key}>
                  {account.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {type === "INVOICE" && (
        <div className="grid gap-4 rounded-lg border border-[#e7e0ef] bg-slate-50/40 p-4 md:grid-cols-2 xl:grid-cols-4">
          <TextField label="Invoice 日期" type="date" value={invoiceDate} setValue={setInvoiceDate} />
          <TextField label="付款截止日" type="date" value={dueDate} setValue={setDueDate} />
          <TextField label="BILL TO 客户名称" value={clientName} setValue={setClientName} />
          <TextField label="客户地址（可选）" value={clientAddress} setValue={setClientAddress} />
          <div className="md:col-span-2 xl:col-span-4">
            <TextField label="附加条款" value={terms} setValue={setTerms} />
          </div>
        </div>
      )}
      {type === "DOMESTIC" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50/40 px-4 py-3">
          <div>
            <p className="text-xs font-medium text-slate-600">开票金额汇总</p>
            <p className="mt-1 text-xs text-slate-500">
              自动汇总下方全部明细的含税金额
            </p>
          </div>
          <strong className="text-lg text-slate-900">
            {currency} {total.toFixed(2)}
          </strong>
        </div>
      )}
      <div className="space-y-3">
        {lines.map((line, index) => {
          const untaxed =
            Number(line.quantity || 0) * Number(line.unitPrice || 0);
          const tax =
            type === "DOMESTIC"
              ? (untaxed * Number(line.taxRate || 0)) / 100
              : 0;
          return (
            <div
              key={line.key}
              className="rounded-lg border border-slate-200 p-4"
            >
              <div className="mb-3 flex justify-between">
                <strong className="text-sm">开票明细 {index + 1}</strong>
                <button
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((rows) =>
                      rows.filter((row) => row.key !== line.key),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </button>
              </div>
              <div
                className={`grid gap-3 md:grid-cols-2 ${
                  type === "DOMESTIC"
                    ? "xl:grid-cols-[1.1fr_1.35fr_1fr_0.8fr_0.9fr]"
                    : "xl:grid-cols-4"
                }`}
              >
                <Field label="费用类型">
                  <select
                    className="input"
                    value={line.feeType}
                    onChange={(e) =>
                      patchLine(line.key, { feeType: e.target.value })
                    }
                  >
                    <option value="MONTHLY_FEE">月度服务费</option>
                    <option value="SALES_COMMISSION">销售佣金</option>
                    <option value="AFFILIATE_FEE">联盟商费用</option>
                    <option value="SINGLE_CHANNEL_FEE">单渠道费用</option>
                  </select>
                </Field>
                <Field label="服务所属月份（必填，可多选）">
                  <details className="group relative">
                    <summary className="input flex min-h-10 cursor-pointer list-none items-center justify-between">
                      <span
                        className={
                          line.months.length
                            ? "text-slate-800"
                            : "text-slate-500"
                        }
                      >
                        {line.months.length
                          ? line.months.join("、")
                          : "请选择服务月份"}
                      </span>
                      <span
                        aria-hidden
                        className="text-slate-500 transition-transform group-open:rotate-180"
                      >
                        ⌄
                      </span>
                    </summary>
                    <div className="absolute z-20 mt-1 max-h-60 w-full min-w-44 overflow-y-auto rounded-md border border-[#dcd4e7] bg-white p-2 shadow-lg">
                      {monthOptions().map((month) => (
                        <label
                          key={month}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-brand-50"
                        >
                          <input
                            type="checkbox"
                            checked={line.months.includes(month)}
                            onChange={(event) =>
                              patchLine(line.key, {
                                months: event.target.checked
                                  ? [...line.months, month].sort()
                                  : line.months.filter(
                                      (value) => value !== month,
                                    ),
                              })
                            }
                          />
                          {month}
                        </label>
                      ))}
                    </div>
                  </details>
                </Field>
                {type === "INVOICE" && (
                  <TextField
                    label="数量"
                    type="number"
                    value={line.quantity}
                    setValue={(v) => patchLine(line.key, { quantity: v })}
                  />
                )}
                {type === "INVOICE" && (
                  <Field label="货币">
                    <select
                      className="input"
                      value={line.currency}
                      onChange={(event) => {
                        const nextCurrency = event.target.value.toUpperCase();
                        setCurrency(nextCurrency);
                        setLines((rows) =>
                          rows.map((row) => ({ ...row, currency: nextCurrency })),
                        );
                      }}
                    >
                      <option value="USD">USD — 美元</option>
                      <option value="CNY">CNY — 人民币</option>
                      <option value="HKD">HKD — 港币</option>
                      <option value="EUR">EUR — 欧元</option>
                      <option value="GBP">GBP — 英镑</option>
                      <option value="JPY">JPY — 日元</option>
                    </select>
                  </Field>
                )}
                <TextField
                  label={
                    type === "DOMESTIC" ? `不含税金额 ${currency}` : "单价"
                  }
                  type="number"
                  value={line.unitPrice}
                  setValue={(v) =>
                    patchLine(
                      line.key,
                      type === "DOMESTIC"
                        ? { unitPrice: v, quantity: "1" }
                        : { unitPrice: v },
                    )
                  }
                />
                {type === "DOMESTIC" && (
                  <TextField
                    label="税率 %"
                    type="number"
                    value={line.taxRate}
                    setValue={(v) => patchLine(line.key, { taxRate: v })}
                  />
                )}
                {type === "INVOICE" && (
                  <>
                    <Field label="推广平台">
                      <select
                        className="input"
                        value={line.promoPlatform}
                        onChange={(event) =>
                          patchLine(line.key, {
                            promoPlatform: event.target.value,
                          })
                        }
                      >
                        <option value="">请选择</option>
                        {(selectedContract?.promoPlatforms ?? []).map(
                          (value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field label="目标站点">
                      <select
                        className="input"
                        value={line.targetSite}
                        onChange={(event) =>
                          patchLine(line.key, {
                            targetSite: event.target.value,
                          })
                        }
                      >
                        <option value="">请选择</option>
                        {(selectedContract?.targetSites ?? []).map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="联盟平台">
                      <select
                        className="input"
                        value={line.affiliatePlatform}
                        onChange={(event) =>
                          patchLine(line.key, {
                            affiliatePlatform: event.target.value,
                          })
                        }
                      >
                        <option value="">请选择</option>
                        {(selectedContract?.affiliatePlatforms ?? []).map(
                          (value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                    <TextField
                      label="备注"
                      value={line.remark}
                      setValue={(v) => patchLine(line.key, { remark: v })}
                    />
                  </>
                )}
                <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                  <p>不含税 {untaxed.toFixed(2)}</p>
                  {type === "DOMESTIC" && (
                    <>
                      <p>税额 {tax.toFixed(2)}</p>
                      <strong className="text-slate-900">
                        开票金额 {(untaxed + tax).toFixed(2)}
                      </strong>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="btn-secondary"
          onClick={() =>
            setLines((rows) => [...rows, { ...emptyLine(), currency }])
          }
        >
          <Plus className="h-4 w-4" />
          添加明细
        </button>
        <div className="flex items-center gap-4">
          <strong>
            {type === "DOMESTIC" ? "含税合计" : "合计"} {currency}{" "}
            {total.toFixed(2)}
          </strong>
          <button
            className="btn-primary"
            disabled={
              disabled ||
              !customerId ||
              (type === "INVOICE" && !contractId) ||
              (type === "INVOICE" && !bankAccountKey) ||
              (type === "DOMESTIC" && !billingProfileId) ||
              lines.some((row) => !row.months.length) ||
              total <= 0
            }
            onClick={() =>
              onSubmit({
                documentType: type,
                customerId,
                contractId: contractId || undefined,
                note:
                  type === "DOMESTIC"
                    ? `开票资料:${billingProfileId};发票类型:${invoiceKind}`
                    : `INVOICE_META:${JSON.stringify({
                        bankAccountKey,
                        invoiceDate,
                        dueDate,
                        clientName,
                        clientAddress,
                        terms,
                      })}`,
                items: lines.map((row) => ({
                  description:
                    type === "INVOICE"
                      ? [
                          data.customers.find((item) => item.id === customerId)
                            ?.label,
                          row.promoPlatform,
                          row.targetSite,
                          row.affiliatePlatform,
                          row.months.join("、"),
                          row.feeType === "MONTHLY_FEE"
                            ? "月度服务费"
                            : row.feeType === "SALES_COMMISSION"
                              ? "销售佣金"
                              : row.feeType === "AFFILIATE_FEE"
                                ? "联盟商费用"
                                : "单渠道费用",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : row.feeType,
                  feeType: row.feeType,
                  currency: row.currency,
                  periodType: "MONTH",
                  periodLabel: row.months.join(","),
                  serviceMonths: row.months,
                  quantity: Number(row.quantity),
                  unitPrice: Number(row.unitPrice),
                  netAmount: Number(row.quantity) * Number(row.unitPrice),
                  promoPlatform: row.promoPlatform || undefined,
                  targetSite: row.targetSite || undefined,
                  affiliatePlatform: row.affiliatePlatform || undefined,
                  taxRate:
                    type === "DOMESTIC" ? Number(row.taxRate) / 100 : undefined,
                  remark: row.remark,
                })) as ManualBillingItemInput[],
              })
            }
          >
            提交开票申请
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ data, disabled, onSubmit }: FormProps) {
  const [form, setForm] = useState({
    category: "SUPPLIER",
    payerEntityId: "",
    payerAccountId: "",
    payeeAccountId: "",
    payeeName: "",
    reason: "",
    currency: "CNY",
    amount: "",
    scheduledAt: new Date().toISOString().slice(0, 10),
    billingRequestId: "",
    receiptId: "",
    attachmentUrls: "",
    note: "",
  });
  const patch = (key: keyof typeof form, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <FormGrid>
      <Field label="付款分类">
        <select
          className="input"
          value={form.category}
          onChange={(e) => patch("category", e.target.value)}
        >
          <option value="SUPPLIER">公司采购付款</option>
          <option value="CHANNEL">渠道商付款</option>
          <option value="AFFILIATE">联盟商固费付款</option>
          <option value="TAX">税费</option>
          <option value="PAYROLL">薪酬</option>
          <option value="OTHER">其他</option>
        </select>
      </Field>
      <SelectField
        label="付款主体"
        value={form.payerEntityId}
        setValue={(v) => patch("payerEntityId", v)}
        options={data.companyEntities}
      />
      <SelectField
        label="付款账户"
        value={form.payerAccountId}
        setValue={(v) => patch("payerAccountId", v)}
        options={data.payerAccounts}
      />
      <SelectField
        label="系统已有收款账户"
        value={form.payeeAccountId}
        setValue={(v) => patch("payeeAccountId", v)}
        options={data.payeeAccounts}
      />
      <TextField
        label="收款对象 / 户名"
        value={form.payeeName}
        setValue={(v) => patch("payeeName", v)}
      />
      <TextField
        label="付款事由"
        value={form.reason}
        setValue={(v) => patch("reason", v)}
      />
      <TextField
        label="币种"
        value={form.currency}
        setValue={(v) => patch("currency", v.toUpperCase())}
      />
      <TextField
        label="金额"
        type="number"
        value={form.amount}
        setValue={(v) => patch("amount", v)}
      />
      <TextField
        label="计划付款日"
        type="date"
        value={form.scheduledAt}
        setValue={(v) => patch("scheduledAt", v)}
      />
      <SelectField
        label="关联开票申请（可选）"
        value={form.billingRequestId}
        setValue={(v) => patch("billingRequestId", v)}
        options={data.billingRequests}
      />
      <SelectField
        label="关联到账记录（可选）"
        value={form.receiptId}
        setValue={(v) => patch("receiptId", v)}
        options={data.receipts}
      />
      <TextField
        label="附件 URL（多条用逗号分隔）"
        value={form.attachmentUrls}
        setValue={(v) => patch("attachmentUrls", v)}
      />
      <Field label="备注" wide>
        <textarea
          className="input min-h-20"
          value={form.note}
          onChange={(e) => patch("note", e.target.value)}
        />
      </Field>
      <Submit
        disabled={
          disabled ||
          !form.payerEntityId ||
          !form.payerAccountId ||
          !form.payeeName ||
          Number(form.amount) <= 0
        }
        onClick={() =>
          onSubmit({
            supplierName: form.payeeName,
            supplierType: form.category,
            accountName:
              data.payeeAccounts.find((row) => row.id === form.payeeAccountId)
                ?.accountName ?? form.payeeName,
            bankName: data.payeeAccounts.find(
              (row) => row.id === form.payeeAccountId,
            )?.bankName,
            accountNumber:
              data.payeeAccounts.find((row) => row.id === form.payeeAccountId)
                ?.accountNumber ?? "",
            payerEntity: data.companyEntities.find(
              (row) => row.id === form.payerEntityId,
            )?.label,
            payerAccountProfileId: form.payerAccountId,
            reason: form.reason,
            currency: form.currency,
            amount: Number(form.amount),
            scheduledAt: form.scheduledAt,
            relatedInvoiceId: form.billingRequestId || undefined,
            relatedReceiptId: form.receiptId || undefined,
            attachmentUrls: splitUrls(form.attachmentUrls),
            note: form.note,
          })
        }
      >
        提交付款申请
      </Submit>
    </FormGrid>
  );
}

function ExpenseForm({ data, disabled, onSubmit }: FormProps) {
  const [form, setForm] = useState({
    entityId: "",
    expenseType: "SOFTWARE",
    customType: "",
    description: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    currency: "CNY",
    amount: "",
    reimbursementAccountId: "",
    accountName: "",
    accountNumber: "",
    attachmentUrls: "",
    note: "",
  });
  const patch = (key: keyof typeof form, value: string) =>
    setForm({ ...form, [key]: value });
  const employeeAccounts = data.financeProfiles.filter(
    (row) => row.category === "EMPLOYEE_REIMBURSEMENT",
  );
  return (
    <FormGrid>
      <SelectField
        label="报销主体"
        value={form.entityId}
        setValue={(v) => patch("entityId", v)}
        options={data.companyEntities}
      />
      <Field label="费用类型">
        <select
          className="input"
          value={form.expenseType}
          onChange={(e) => patch("expenseType", e.target.value)}
        >
          <option value="SOFTWARE">软件工具</option>
          <option value="TRAVEL">差旅</option>
          <option value="TRANSPORT">交通</option>
          <option value="ENTERTAINMENT">招待</option>
          <option value="OFFICE">办公</option>
          <option value="OTHER">自定义</option>
        </select>
      </Field>
      {form.expenseType === "OTHER" && (
        <TextField
          label="自定义费用类型"
          value={form.customType}
          setValue={(v) => patch("customType", v)}
        />
      )}
      <TextField
        label="费用内容"
        value={form.description}
        setValue={(v) => patch("description", v)}
      />
      <TextField
        label="费用日期"
        type="date"
        value={form.expenseDate}
        setValue={(v) => patch("expenseDate", v)}
      />
      <TextField
        label="币种"
        value={form.currency}
        setValue={(v) => patch("currency", v.toUpperCase())}
      />
      <TextField
        label="金额"
        type="number"
        value={form.amount}
        setValue={(v) => patch("amount", v)}
      />
      <SelectField
        label="已有报销账户"
        value={form.reimbursementAccountId}
        setValue={(v) => patch("reimbursementAccountId", v)}
        options={employeeAccounts}
      />
      <TextField
        label="自定义收款户名"
        value={form.accountName}
        setValue={(v) => patch("accountName", v)}
      />
      <TextField
        label="自定义收款账号"
        value={form.accountNumber}
        setValue={(v) => patch("accountNumber", v)}
      />
      <TextField
        label="发票 / 凭证附件 URL"
        value={form.attachmentUrls}
        setValue={(v) => patch("attachmentUrls", v)}
      />
      <Field label="备注" wide>
        <textarea
          className="input min-h-20"
          value={form.note}
          onChange={(e) => patch("note", e.target.value)}
        />
      </Field>
      <Submit
        disabled={
          disabled ||
          !form.entityId ||
          !form.description ||
          Number(form.amount) <= 0 ||
          (!form.reimbursementAccountId &&
            (!form.accountName || !form.accountNumber))
        }
        onClick={() =>
          onSubmit({
            reimbursementEntity:
              data.companyEntities.find((row) => row.id === form.entityId)
                ?.label ?? "",
            currency: form.currency,
            accountName:
              data.financeProfiles.find(
                (row) => row.id === form.reimbursementAccountId,
              )?.accountName ?? form.accountName,
            accountNumber:
              data.financeProfiles.find(
                (row) => row.id === form.reimbursementAccountId,
              )?.accountNumber ?? form.accountNumber,
            note: form.note,
            attachmentUrls: splitUrls(form.attachmentUrls),
            items: [
              {
                description: form.description,
                expenseType:
                  form.expenseType === "OTHER"
                    ? form.customType
                    : form.expenseType,
                expenseDate: form.expenseDate,
                amount: Number(form.amount),
                invoiceUrls: splitUrls(form.attachmentUrls),
              },
            ],
          })
        }
      >
        提交费用报销
      </Submit>
    </FormGrid>
  );
}

function ProfileForm({ data, disabled, onSubmit }: FormProps) {
  const [category, setCategory] = useState<ProfileCategory>("CUSTOMER_BILLING");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [manualAffiliate, setManualAffiliate] = useState(false);
  const emptyProfile = () => ({
    ownerObjectId: "",
    name: "",
    accountName: "",
    accountNumber: "",
    bankName: "",
    swiftCode: "",
    bankAddress: "",
    payeeAddress: "",
    routingNumber: "",
    note: "",
    currency: ["CHANNEL_PAYEE", "AFFILIATE_PAYEE"].includes(category) ? "USD" : "CNY",
  });
  const [form, setForm] = useState(emptyProfile);
  const existing = data.financeProfiles.filter((row) => row.category === category);
  const patch = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const nameOptions =
    category === "CUSTOMER_BILLING"
      ? data.customerOptions ?? data.customers
      : category === "CHANNEL_PAYEE"
        ? data.channelAccountOptions ?? []
        : category === "EMPLOYEE_REIMBURSEMENT"
          ? data.employeeAccountOptions ?? []
          : category === "AFFILIATE_PAYEE"
            ? data.affiliateOptions ?? []
            : [];
  const usesSystemName = ["CUSTOMER_BILLING", "CHANNEL_PAYEE", "EMPLOYEE_REIMBURSEMENT"].includes(category);
  const companyLabel = ["CUSTOMER_BILLING", "COMPANY_PAYER", "SUPPLIER_PAYEE"].includes(category)
    ? "公司名称/发票抬头"
    : "账户名称";
  const startNew = () => {
    setEditingId("");
    setManualAffiliate(false);
    setForm(emptyProfile());
    setEditorOpen(true);
  };
  const startEdit = (row: FinanceObjectOption) => {
    setEditingId(row.id);
    setManualAffiliate(category === "AFFILIATE_PAYEE");
    setForm({
      ownerObjectId: row.id,
      name: row.label,
      accountName: row.accountName ?? "",
      accountNumber: row.accountNumber ?? "",
      bankName: row.bankName ?? "",
      swiftCode: row.swiftCode ?? row.taxNumber ?? "",
      bankAddress: row.bankAddress ?? row.address ?? "",
      payeeAddress: row.payeeAddress ?? "",
      routingNumber: row.routingNumber ?? "",
      note: row.note ?? "",
      currency: row.currency ?? (["CHANNEL_PAYEE", "AFFILIATE_PAYEE"].includes(category) ? "USD" : "CNY"),
    });
    setEditorOpen(true);
  };
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(profileLabels) as ProfileCategory[]).map((key) => (
          <button
            key={key}
            onClick={() => {
              setCategory(key);
              setEditorOpen(false);
              setEditingId("");
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${category === key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {key === "SUPPLIER_PAYEE" ? "公司采购供应商" : profileLabels[key]}
          </button>
        ))}
      </div>

      {!editorOpen && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{category === "SUPPLIER_PAYEE" ? "公司采购供应商" : profileLabels[category]}</h3>
              <p className="mt-1 text-xs text-slate-500">统一维护账户资料，保存后可在付款、开票和报销流程中直接选择。</p>
            </div>
            <button className="btn-primary" onClick={startNew} disabled={disabled}>
              <Plus className="h-4 w-4" /> 新增资料
            </button>
          </div>
          {existing.length ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {existing.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 border-b border-slate-100 p-4 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{row.label}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{row.accountName || row.subtitle || "未填写账户名称"}{row.accountNumber ? ` · ${row.accountNumber}` : ""}</p>
                  </div>
                  {row.editable !== false && (
                    <button className="btn-secondary shrink-0" onClick={() => startEdit(row)}>编辑</button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">暂无已保存资料，点击“新增资料”开始创建。</div>
          )}
        </>
      )}

      {editorOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">{editingId ? "编辑资料" : "新增资料"}</h3>
              <p className="mt-1 text-xs text-slate-500">{category === "SUPPLIER_PAYEE" ? "公司采购供应商" : profileLabels[category]}</p>
            </div>
            <button className="btn-secondary" onClick={() => setEditorOpen(false)}>取消</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {usesSystemName ? (
              <SelectField
                label="资料名称"
                value={form.ownerObjectId}
                setValue={(id) => {
                  const selected = nameOptions.find((row) => row.id === id);
                  patch("ownerObjectId", id);
                  setForm((current) => ({ ...current, ownerObjectId: id, name: selected?.label ?? "", accountName: current.accountName || selected?.accountName || selected?.label || "" }));
                }}
                options={nameOptions}
              />
            ) : category === "AFFILIATE_PAYEE" && !manualAffiliate ? (
              <Field label="资料名称">
                <div className="flex gap-2">
                  <input
                    className="input"
                    list="finance-affiliate-options"
                    value={form.name}
                    onChange={(event) => {
                      const value = event.target.value;
                      const selected = nameOptions.find((row) => row.label === value);
                      setForm((current) => ({ ...current, name: value, ownerObjectId: selected?.id ?? "", accountName: current.accountName || value }));
                    }}
                    placeholder="搜索联盟资源库"
                  />
                  <datalist id="finance-affiliate-options">{nameOptions.map((row) => <option key={row.id} value={row.label} />)}</datalist>
                  <button className="btn-secondary shrink-0" onClick={() => setManualAffiliate(true)}>手动新增</button>
                </div>
              </Field>
            ) : (
              <TextField label="资料名称" value={form.name} setValue={(value) => patch("name", value)} />
            )}
            <TextField label={companyLabel} value={form.accountName} setValue={(value) => patch("accountName", value)} />
            <TextField label={category === "EMPLOYEE_REIMBURSEMENT" || category === "CHANNEL_PAYEE" ? "收款账号/银行账号" : "银行账号"} value={form.accountNumber} setValue={(value) => patch("accountNumber", value)} />
            <TextField label={category === "AFFILIATE_PAYEE" ? "银行名称及开户行" : "开户行"} value={form.bankName} setValue={(value) => patch("bankName", value)} />
            <TextField label={category === "AFFILIATE_PAYEE" ? "SWIFT Code" : "SWIFT Code/税号"} value={form.swiftCode} setValue={(value) => patch("swiftCode", value)} />
            <TextField label="银行地址" value={form.bankAddress} setValue={(value) => patch("bankAddress", value)} />
            {category === "AFFILIATE_PAYEE" && (
              <>
                <TextField label="收款人地址" value={form.payeeAddress} setValue={(value) => patch("payeeAddress", value)} />
                <TextField label="Routing Number (ACH)" value={form.routingNumber} setValue={(value) => patch("routingNumber", value)} />
                <TextField label="备注" value={form.note} setValue={(value) => patch("note", value)} />
              </>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setEditorOpen(false)}>取消</button>
            <button
              className="btn-primary"
              disabled={disabled || !form.name.trim() || !form.accountName.trim() || !form.accountNumber.trim()}
              onClick={() => {
                onSubmit({
                  id: editingId || undefined,
                  name: form.name,
                  accountType: category,
                  legalEntity: form.accountName,
                  accountName: form.accountName,
                  bankName: form.bankName,
                  accountNumber: form.accountNumber,
                  currency: form.currency,
                  swiftCode: form.swiftCode,
                  bankAddress: form.bankAddress,
                  payeeAddress: form.payeeAddress,
                  routingNumber: form.routingNumber,
                  note: form.note,
                  payerAccountKey: form.ownerObjectId || undefined,
                });
                setEditorOpen(false);
              }}
            >
              {editingId ? "保存修改" : "创建资料"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LegacyProfileForm({ data, disabled, onSubmit }: FormProps) {
  const [category, setCategory] = useState<ProfileCategory>("CUSTOMER_BILLING");
  const existing = data.financeProfiles.filter(
    (row) => row.category === category,
  );
  const [form, setForm] = useState({
    ownerObjectId: "",
    name: "",
    accountName: "",
    accountNumber: "",
    bankName: "",
    swiftCode: "",
    currency: "CNY",
    taxNumber: "",
    address: "",
    phone: "",
    email: "",
    attachmentUrls: "",
  });
  const patch = (key: keyof typeof form, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(profileLabels) as ProfileCategory[]).map((key) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${category === key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {profileLabels[key]}
          </button>
        ))}
      </div>
      {existing.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {existing.map((row) => (
            <button
              key={row.id}
              className="rounded-lg border border-slate-200 p-3 text-left hover:border-brand-300"
              onClick={() =>
                setForm({
                  ...form,
                  ownerObjectId: row.id,
                  name: row.label,
                  accountName: row.accountName ?? "",
                  accountNumber: row.accountNumber ?? "",
                  bankName: row.bankName ?? "",
                  currency: row.currency ?? "CNY",
                })
              }
            >
              <strong className="text-sm">{row.label}</strong>
              <p className="mt-1 text-xs text-slate-500">
                {row.subtitle ?? "使用系统已有资料"}
              </p>
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <TextField
          label="资料名称"
          value={form.name}
          setValue={(v) => patch("name", v)}
        />
        <TextField
          label="户名 / 发票抬头"
          value={form.accountName}
          setValue={(v) => patch("accountName", v)}
        />
        <TextField
          label="账号"
          value={form.accountNumber}
          setValue={(v) => patch("accountNumber", v)}
        />
        <TextField
          label="开户行"
          value={form.bankName}
          setValue={(v) => patch("bankName", v)}
        />
        <TextField
          label="SWIFT"
          value={form.swiftCode}
          setValue={(v) => patch("swiftCode", v)}
        />
        <TextField
          label="币种"
          value={form.currency}
          setValue={(v) => patch("currency", v)}
        />
        {category === "CUSTOMER_BILLING" && (
          <>
            <TextField
              label="税号"
              value={form.taxNumber}
              setValue={(v) => patch("taxNumber", v)}
            />
            <TextField
              label="注册地址"
              value={form.address}
              setValue={(v) => patch("address", v)}
            />
            <TextField
              label="注册电话"
              value={form.phone}
              setValue={(v) => patch("phone", v)}
            />
            <TextField
              label="接收邮箱"
              value={form.email}
              setValue={(v) => patch("email", v)}
            />
          </>
        )}
        <TextField
          label="资料附件 URL"
          value={form.attachmentUrls}
          setValue={(v) => patch("attachmentUrls", v)}
        />
      </div>
      <div className="flex justify-end">
        <button
          className="btn-primary"
          disabled={disabled || !form.name || !form.accountName}
          onClick={() =>
            onSubmit({
              id: form.ownerObjectId || undefined,
              name: form.name,
              accountType: category,
              legalEntity: form.accountName,
              accountName: form.accountName,
              bankName: form.bankName,
              accountNumber: form.accountNumber,
              currency: form.currency,
              swiftCode: form.swiftCode,
              attachmentUrls: splitUrls(form.attachmentUrls),
            })
          }
        >
          保存财务资料
        </button>
      </div>
    </div>
  );
}

type FormProps = {
  data: FinanceFlowHubData;
  disabled: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
};
function Entry({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-28 items-start gap-4 border-b border-slate-100 p-5 text-left hover:bg-[#faf8ff] md:odd:border-r"
    >
      <span className="rounded-md bg-brand-50 p-2.5 text-brand-700 [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <span>
        <strong className="text-slate-900">{title}</strong>
        <span className="mt-2 block text-sm text-slate-500">{detail}</span>
      </span>
    </button>
  );
}
function Choice({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-slate-200 p-5 text-left hover:border-brand-300 hover:bg-brand-50/30"
    >
      <strong>{title}</strong>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </button>
  );
}
function FormGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label
      className={`block space-y-1.5 text-sm text-slate-700 ${wide ? "md:col-span-2 xl:col-span-3" : ""}`}
    >
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function TextField({
  label,
  value,
  setValue,
  type = "text",
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  type?: string;
}) {
  return (
    <Field label={label}>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </Field>
  );
}
function SelectField({
  label,
  value,
  setValue,
  options,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: FinanceObjectOption[];
}) {
  return (
    <Field label={label}>
      <select
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">请选择</option>
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {row.label}
            {row.subtitle ? ` · ${row.subtitle}` : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Submit({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-end md:col-span-2 xl:col-span-3">
      <button
        className="btn-primary ml-auto"
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    </div>
  );
}
function splitUrls(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function monthOptions(): string[] {
  const now = new Date();
  return Array.from({ length: 36 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 12 + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function ProgressTable({
  rows,
  kind,
}: {
  rows: FinanceProgressRow[];
  kind: "BILLING_REQUEST" | "PAYMENT_REQUEST" | "EXPENSE_CLAIM";
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  async function decide(id: string, action: "APPROVE" | "REJECT") {
    const comment =
      action === "REJECT"
        ? (window.prompt("请填写驳回原因") ?? undefined)
        : undefined;
    if (action === "REJECT" && !comment) return;
    setBusyId(id);
    const result = await decideFinanceRequest(kind, id, action, comment);
    setBusyId(null);
    if (!result.ok) window.alert(result.error ?? "操作失败");
    else window.location.reload();
  }
  return (
    <section className="border-t border-slate-100 p-5">
      <h3 className="font-semibold text-slate-900">我的申请与审批进度</h3>
      <p className="mt-1 text-xs text-slate-500">
        依次经过 Shallow 审核、财务处理和完成回传。
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-2">申请单</th>
              <th>对象 / 事项</th>
              <th>金额</th>
              <th>审批进度</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-3 font-medium text-slate-900">
                  {row.requestNo}
                </td>
                <td>
                  <p>{row.objectName}</p>
                  <p className="text-xs text-slate-500">{row.detail}</p>
                </td>
                <td>
                  {row.currency} {row.amount.toFixed(2)}
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {(row.steps ?? []).map((step) => (
                      <span
                        key={step.label}
                        className={`rounded-full px-2 py-1 text-xs ${step.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : step.status === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {step.label} ·{" "}
                        {step.status === "APPROVED"
                          ? "已完成"
                          : step.status === "REJECTED"
                            ? "已驳回"
                            : "待处理"}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  {row.rejectionReason ? (
                    <span className="text-rose-700">{row.rejectionReason}</span>
                  ) : (
                    row.status
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.some((row) => row.steps?.[0]?.status === "PENDING") && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-600">
              待 Shallow 审核
            </p>
            {rows
              .filter((row) => row.steps?.[0]?.status === "PENDING")
              .map((row) => (
                <div
                  key={`review-${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm"
                >
                  <span>
                    {row.requestNo} · {row.objectName}
                  </span>
                  <span className="flex gap-3">
                    <button
                      className="font-medium text-emerald-700 hover:underline disabled:opacity-50"
                      disabled={busyId === row.id}
                      onClick={() => decide(row.id, "APPROVE")}
                    >
                      审核通过
                    </button>
                    <button
                      className="font-medium text-rose-700 hover:underline disabled:opacity-50"
                      disabled={busyId === row.id}
                      onClick={() => decide(row.id, "REJECT")}
                    >
                      驳回
                    </button>
                  </span>
                </div>
              ))}
          </div>
        )}
        {rows.some(
          (row) =>
            row.steps?.[0]?.status === "APPROVED" &&
            row.steps?.[1]?.status === "PENDING" &&
            ["PROCESSING", "APPROVED"].includes(row.status),
        ) && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-600">待财务处理</p>
            {rows
              .filter(
                (row) =>
                  row.steps?.[0]?.status === "APPROVED" &&
                  row.steps?.[1]?.status === "PENDING" &&
                  ["PROCESSING", "APPROVED"].includes(row.status),
              )
              .map((row) => (
                <div
                  key={`finance-return-${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm"
                >
                  <span>
                    {row.requestNo} · {row.objectName}
                  </span>
                  <button
                    className="font-medium text-rose-700 hover:underline disabled:opacity-50"
                    disabled={busyId === row.id}
                    onClick={() => decide(row.id, "REJECT")}
                  >
                    退回申请人
                  </button>
                </div>
              ))}
          </div>
        )}
        {!rows.length && (
          <p className="py-8 text-center text-sm text-slate-500">
            暂无已提交记录。
          </p>
        )}
      </div>
    </section>
  );
}
