import { notFound, redirect } from "next/navigation";
import { getInvoiceById, getInvoiceFormOptions } from "@/actions/invoices";
import { isStaff } from "@/lib/permissions";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { requireSession } from "@/lib/session";
import { InvoiceEditor } from "../InvoiceEditor";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/operations");
  const { id } = await params;
  const [invoice, options, permission] = await Promise.all([
    getInvoiceById(id),
    getInvoiceFormOptions(),
    resolveUserPermission(session.userId, "operations.invoices"),
  ]);
  if (!invoice) notFound();

  return (
    <InvoiceEditor
      options={options}
      initialInvoice={invoice}
      canEdit={hasPermissionLevel(permission, "EDIT")}
    />
  );
}
