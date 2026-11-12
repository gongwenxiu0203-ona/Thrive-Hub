"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DomesticBillingInfo } from "@/components/finance/DomesticBillingInfo";
import { domesticPrefill, type DomesticBillingDetails } from "@/lib/domesticBilling";

type RequestData = {
  domesticDetails?: DomesticBillingDetails | null;
  initialAmounts?: ReturnType<typeof domesticPrefill>;
  mixedTaxRates?: boolean;
  taxDataKnown?: boolean;
  id: string;
  requestNo: string;
  currency: string;
  requestedAmount: number;
  lines: Array<{
    id: string;
    feeType: string;
    currency: string;
    requestedAmount: number;
    periodStart: string;
    periodEnd: string;
  }>;
};
type FormFields = {
  invoiceNumber: string;
  invoiceCode: string;
  invoiceType: string;
  invoiceDate: string;
  netAmount: string;
  taxRate: string;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function DomesticInvoiceForm({ request }: { request: RequestData }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState("");
  const initialAmounts=request.initialAmounts ?? domesticPrefill(request.requestedAmount);
  const [amountsEdited,setAmountsEdited]=useState(false);
  const [recognition, setRecognition] = useState<{
    tone: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [fields, setFields] = useState<FormFields>({
    invoiceNumber: "",
    invoiceCode: "",
    invoiceType: request.domesticDetails?.invoiceType ?? "VAT_ORDINARY",
    invoiceDate: new Date().toISOString().slice(0, 10),
    netAmount: initialAmounts.netAmount.toFixed(2),
    taxRate: String(initialAmounts.taxRate),
  });
  const calculatedAmounts = useMemo(() => {
    if(!amountsEdited)return {taxAmount:initialAmounts.taxAmount.toFixed(2),taxInclusiveAmount:initialAmounts.taxInclusiveAmount.toFixed(2)};
    const netAmount = Number(fields.netAmount);
    const taxRate = Number(fields.taxRate);
    if (!Number.isFinite(netAmount) || !Number.isFinite(taxRate)) {
      return { taxAmount: "", taxInclusiveAmount: "" };
    }
    const taxAmount = roundMoney((netAmount * taxRate) / 100);
    return {
      taxAmount: taxAmount.toFixed(2),
      taxInclusiveAmount: roundMoney(netAmount + taxAmount).toFixed(2),
    };
  }, [fields.netAmount, fields.taxRate,amountsEdited,initialAmounts.taxAmount,initialAmounts.taxInclusiveAmount]);
  const update = (key: keyof FormFields, value: string) => {
    if(key==='netAmount'||key==='taxRate')setAmountsEdited(true);
    setFields((current) => ({ ...current, [key]: value }));
  };

  async function recognize(file: File | undefined) {
    if (!file) return;
    setRecognizing(true);
    setRecognition(null);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        `/api/finance/billing/${request.id}/domestic/extract`,
        { method: "POST", body },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        return setRecognition({
          tone: "error",
          message: payload.error ?? "自动识别失败，请手工填写。",
        });
      const extracted = payload.fields ?? {};
      if(extracted.netAmount!==undefined || extracted.taxRate!==undefined)setAmountsEdited(true);
      setFields((current) => ({
        ...current,
        invoiceNumber: extracted.invoiceNumber ?? current.invoiceNumber,
        invoiceCode: extracted.invoiceCode ?? current.invoiceCode,
        invoiceType: extracted.invoiceType ?? current.invoiceType,
        invoiceDate: extracted.invoiceDate ?? current.invoiceDate,
        netAmount:
          extracted.netAmount !== undefined
            ? String(extracted.netAmount)
            : current.netAmount,
        taxRate:
          extracted.taxRate !== undefined
            ? String(extracted.taxRate)
            : current.taxRate,
      }));
      setRecognition({
        tone: payload.recognized >= 5 ? "success" : "warning",
        message: payload.message ?? "识别完成，请核对字段。",
      });
    } catch {
      setRecognition({
        tone: "error",
        message: "自动识别暂时不可用，请手工填写后继续。",
      });
    } finally {
      setRecognizing(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/finance/billing/${request.id}/domestic`,
        { method: "POST", body: new FormData(event.currentTarget) },
      );
      const payload = await response.json();
      if (!response.ok) return setError(payload.error ?? "登记国内发票失败。");
      router.push(`/invoices/${payload.invoiceId}`);
      router.refresh();
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  const statusClass =
    recognition?.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : recognition?.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-700";
  return (
    <form onSubmit={submit} className="space-y-6">
      <DomesticBillingInfo details={request.domesticDetails} />
      {request.taxDataKnown===false&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">历史申请没有完整税额明细，暂按1%从含税总额拆分；请根据实际发票核对税率及金额，不代表原申请的税额快照。</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="font-semibold text-slate-900">发票信息</h2>
            <p className="mt-1 text-sm text-slate-600">
              先选择发票原件，系统会自动识别并预填；提交前请核对识别结果。
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="发票原件 PDF/JPG/PNG（20MB内）" wide>
              <input
                name="file"
                type="file"
                required
                accept="application/pdf,image/png,image/jpeg,image/webp"
                disabled={recognizing || pending}
                onChange={(event) => void recognize(event.target.files?.[0])}
                className="block w-full text-sm"
              />
            </Field>
            {recognizing && (
              <div
                role="status"
                className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800"
              >
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
                正在识别发票内容，请稍候…
              </div>
            )}
            {recognition && !recognizing && (
              <div
                role="status"
                className={`sm:col-span-2 rounded-lg border px-3 py-2 text-sm ${statusClass}`}
              >
                {recognition.message}
              </div>
            )}
            <Field label="发票号码">
              <input
                name="invoiceNumber"
                required
                maxLength={80}
                value={fields.invoiceNumber}
                onChange={(e) => update("invoiceNumber", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="发票代码（选填）">
              <input
                name="invoiceCode"
                maxLength={80}
                value={fields.invoiceCode}
                onChange={(e) => update("invoiceCode", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="发票类型">
              <select
                name="invoiceType"
                required
                value={fields.invoiceType}
                onChange={(e) => update("invoiceType", e.target.value)}
                className="input"
              >
                <option value="VAT_SPECIAL">增值税专用发票</option>
                <option value="VAT_ORDINARY">增值税普通发票</option>
                <option value="ELECTRONIC">电子发票</option>
              </select>
            </Field>
            <Field label="开票日期">
              <input
                name="invoiceDate"
                type="date"
                required
                value={fields.invoiceDate}
                onChange={(e) => update("invoiceDate", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="含税金额">
              <input
                name="taxInclusiveAmount"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={calculatedAmounts.taxInclusiveAmount}
                readOnly
                className="input bg-slate-50 text-slate-700"
              />
            </Field>
            <Field label="未税金额">
              <input
                name="netAmount"
                type="number"
                min="0"
                step="0.01"
                required
                value={fields.netAmount}
                onChange={(e) => update("netAmount", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="税额">
              <input
                name="taxAmount"
                type="number"
                min="0"
                step="0.01"
                required
                value={calculatedAmounts.taxAmount}
                readOnly
                className="input bg-slate-50 text-slate-700"
              />
            </Field>
            <Field label={request.mixedTaxRates?'综合税率（%，原明细保留各自税率）':'税率（%）'}>
              <input
                name="taxRate"
                type="number"
                min="0"
                max="100"
                step="any"
                required
                value={fields.taxRate}
                onChange={(e) => update("taxRate", e.target.value)}
                className="input"
              />
            </Field>
            <p className="sm:col-span-2 text-xs text-slate-500">
              申请总额为含税金额，已按申请明细拆分未税金额与税额，不会重复加税。修改未税金额或税率后将重新计算，请核对票面。
            </p>
          </div>
        </section>
        <aside className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">申请分配</h2>
          <p className="mt-1 text-sm text-slate-600">
            {request.currency}{" "}
            {request.requestedAmount.toLocaleString("zh-CN", {
              minimumFractionDigits: 2,
            })}
          </p>
          <div className="mt-4 space-y-3">
            {request.lines.map((line) => (
              <div key={line.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span>
                    {line.feeType === "FIXED_FEE" ? "固定费" : "销售佣金"}
                  </span>
                  <strong>
                    {line.currency} {line.requestedAmount.toFixed(2)}
                  </strong>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {line.periodStart.slice(0, 10)} ～{" "}
                  {line.periodEnd.slice(0, 10)}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={pending || recognizing}>
          {pending ? "登记中…" : recognizing ? "识别中…" : "确认开票并归档"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`space-y-1.5 text-sm text-slate-700 ${wide ? "sm:col-span-2" : ""}`}
    >
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
