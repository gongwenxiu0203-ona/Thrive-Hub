import { redirect } from "next/navigation";
import { listInvoices } from "@/actions/invoices";
import { isStaff } from "@/lib/permissions";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { requireSession } from "@/lib/session";
import { InvoiceListClient } from "./InvoiceListClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "开票与收款 · Thraive 联盟营销系统" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/operations");
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const status = params.status ?? "";
  const invoiceStatus = status === "DRAFT" || status === "ISSUED" || status === "VOID"
    ? status
    : undefined;
  const [invoices, permission] = await Promise.all([
    listInvoices({
      search: search || undefined,
      status: invoiceStatus,
    }),
    resolveUserPermission(session.userId, "operations.invoices"),
  ]);

  return (
    <InvoiceListClient
      invoices={invoices}
      search={search}
      status={status}
      canEdit={hasPermissionLevel(permission, "EDIT")}
      canManage={hasPermissionLevel(permission, "MANAGE")}
    />
  );
}
