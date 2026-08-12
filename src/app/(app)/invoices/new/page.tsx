import { redirect } from "next/navigation";
import { getInvoiceFormOptions, getInvoiceReconciliationPrefill } from "@/actions/invoices";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { requireSession } from "@/lib/session";
import { InvoiceEditor } from "../InvoiceEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "新建 Invoice · Thraive 联盟营销系统" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const permission = await resolveUserPermission(session.userId, "operations.invoices");
  if (!hasPermissionLevel(permission, "EDIT")) redirect("/invoices");
  const params = await searchParams;
  const rawIds = params.reconciliationIds ?? params.reconciliationId;
  const rawScope = params.scope;
  const requestedScope = Array.isArray(rawScope) ? rawScope[0] : rawScope;
  const reconciliationIds = (Array.isArray(rawIds) ? rawIds : [rawIds])
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const [options, prefill] = await Promise.all([
    getInvoiceFormOptions(),
    reconciliationIds.length
      ? getInvoiceReconciliationPrefill(reconciliationIds, requestedScope)
      : Promise.resolve(null),
  ]);

  if (prefill?.ok && prefill.existingInvoiceId) {
    redirect(`/invoices/${encodeURIComponent(prefill.existingInvoiceId)}`);
  }

  return (
    <InvoiceEditor
      options={options}
      initialInvoice={prefill?.ok ? prefill.invoice : null}
      initialError={prefill && !prefill.ok ? prefill.error : ""}
    />
  );
}
