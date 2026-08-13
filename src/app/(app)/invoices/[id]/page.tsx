import { notFound, redirect } from "next/navigation";
import { getInvoiceById, getInvoiceFormOptions } from "@/actions/invoices";
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
  const { id } = await params;
  const [invoice, permission] = await Promise.all([
    getInvoiceById(id),
    resolveUserPermission(session.userId, "operations.invoices"),
  ]);
  if (!hasPermissionLevel(permission, "READ")) redirect("/operations");
  if (!invoice) notFound();
  const canEdit = hasPermissionLevel(permission, "EDIT");
  const options = await getInvoiceFormOptions(
    canEdit && invoice.status === "DRAFT",
  );

  return (
    <InvoiceEditor
      options={options}
      initialInvoice={invoice}
      canEdit={canEdit}
    />
  );
}
