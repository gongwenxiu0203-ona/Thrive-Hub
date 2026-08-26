import { redirect } from "next/navigation";
import {
  getInvoiceFormOptions,
  getInvoiceReconciliationPrefill,
  type InvoiceDetail,
} from "@/actions/invoices";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { requireSession } from "@/lib/session";
import { InvoiceEditor } from "../InvoiceEditor";
import { getBillingRequestInvoiceIds } from "@/actions/billingRequests";

export const dynamic = "force-dynamic";
export const metadata = { title: "新建 Invoice · Thraive 联盟营销系统" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const permission = await resolveUserPermission(
    session.userId,
    "finance.invoices",
  );
  if (!hasPermissionLevel(permission, "EDIT")) redirect("/invoices");
  const params = await searchParams;
  const rawIds = params.reconciliationIds ?? params.reconciliationId;
  const rawBillingRequestId = params.billingRequestId;
  const billingRequestId = Array.isArray(rawBillingRequestId)
    ? rawBillingRequestId[0]
    : rawBillingRequestId;
  const rawFocus = params.focus;
  const focusMode =
    (Array.isArray(rawFocus) ? rawFocus[0] : rawFocus) === "invoice";
  const rawScope = params.scope;
  const requestedScope = Array.isArray(rawScope) ? rawScope[0] : rawScope;
  let reconciliationIds = (Array.isArray(rawIds) ? rawIds : [rawIds])
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  let billingError = "";
  let manualPrefill: Awaited<
    ReturnType<typeof getBillingRequestInvoiceIds>
  > extends infer _T
    ? {
        customerId: string;
        customerName: string;
        contractId: string | null;
        bankAccountKey: string | null;
        invoiceDate: string | null;
        dueDate: string | null;
        clientName: string | null;
        clientAddress: string | null;
        terms: string | null;
        items: Array<{
          id: string;
          description: string;
          feeType: string;
          currency: string;
          periodType: string;
          periodLabel: string;
          promoPlatform: string | null;
          targetSite: string | null;
          affiliatePlatform: string | null;
          quantity: number;
          unitPrice: number;
          amount: number;
          sortOrder: number;
        }>;
      } | null
    : never = null;
  if (billingRequestId) {
    const billing = await getBillingRequestInvoiceIds(billingRequestId);
    if (billing.ok) {
      if (billing.existingInvoiceId)
        redirect(
          `/invoices/${encodeURIComponent(billing.existingInvoiceId)}${focusMode ? "?focus=invoice" : ""}`,
        );
      reconciliationIds = billing.reconciliationIds;
      manualPrefill = billing.manualPrefill;
    } else billingError = billing.error;
  }
  const [options, prefill] = await Promise.all([
    getInvoiceFormOptions(true),
    reconciliationIds.length
      ? getInvoiceReconciliationPrefill(reconciliationIds, requestedScope)
      : Promise.resolve(null),
  ]);

  if (prefill?.ok && prefill.existingInvoiceId) {
    redirect(
      `/invoices/${encodeURIComponent(prefill.existingInvoiceId)}${focusMode ? "?focus=invoice" : ""}`,
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(`${today}T00:00:00`);
  due.setDate(due.getDate() + 15);
  const selectedContract = options.contracts.find(
    (row) => row.id === manualPrefill?.contractId,
  );
  const manualItems = manualPrefill?.items ?? [];
  const currencyTotals = [
    ...new Set(manualItems.map((item) => item.currency)),
  ].map((currency) => ({
    currency,
    amount: manualItems
      .filter((item) => item.currency === currency)
      .reduce((sum, item) => sum + item.amount, 0),
  }));
  const manualInitial = manualPrefill
    ? ({
        billingRequestId: billingRequestId ?? null,
        id: "",
        invoiceNo: "",
        customerId: manualPrefill.customerId,
        contractId: manualPrefill.contractId,
        contractIds: manualPrefill.contractId ? [manualPrefill.contractId] : [],
        accountsReceivableId: null,
        invoiceDate: manualPrefill.invoiceDate ?? today,
        dueDate: manualPrefill.dueDate ?? due.toISOString().slice(0, 10),
        periodType: manualItems[0]?.periodType ?? "DATE_RANGE",
        periodLabel: manualItems
          .map((item) => item.periodLabel)
          .filter(Boolean)
          .join("; "),
        feeType:
          new Set(manualItems.map((item) => item.feeType)).size > 1
            ? "MIXED"
            : (manualItems[0]?.feeType ?? "MONTHLY_FEE"),
        clientName: manualPrefill.clientName ?? manualPrefill.customerName,
        clientAddress:
          manualPrefill.clientAddress ?? selectedContract?.address ?? null,
        currency:
          currencyTotals.length === 1 ? currencyTotals[0].currency : "MIXED",
        totalAmount: currencyTotals.length === 1 ? currencyTotals[0].amount : 0,
        currencyTotals,
        bankAccountKey:
          manualPrefill.bankAccountKey ??
          selectedContract?.bankAccounts[0]?.key ??
          null,
        bankSnapshot:
          selectedContract?.bankAccounts.find(
            (account) => account.key === manualPrefill.bankAccountKey,
          ) ??
          selectedContract?.bankAccounts[0] ??
          {},
        terms: manualPrefill.terms,
        status: "DRAFT",
        pdfUrl: null,
        createdById: null,
        createdByName: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: manualItems.map((item) => ({
          ...item,
          feeType: item.feeType as
            "MONTHLY_FEE" | "SALES_COMMISSION" | "AFFILIATE_FEE",
          periodType: item.periodType as "MONTH" | "DATE_RANGE",
        })),
        reconciliationIds: [],
      } as InvoiceDetail)
    : null;

  return (
    <InvoiceEditor
      options={options}
      initialInvoice={
        manualInitial ??
        (prefill?.ok && prefill.invoice
          ? { ...prefill.invoice, billingRequestId: billingRequestId ?? null }
          : null)
      }
      initialError={
        billingError || (prefill && !prefill.ok ? prefill.error : "")
      }
    />
  );
}
