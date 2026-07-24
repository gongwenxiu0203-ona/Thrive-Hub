import { redirect } from "next/navigation";
import { getInvoiceFormOptions } from "@/actions/invoices";
import { isStaff } from "@/lib/permissions";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { requireSession } from "@/lib/session";
import { InvoiceEditor } from "../InvoiceEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "新建 Invoice · Thraive 联盟营销系统" };

export default async function NewInvoicePage() {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/operations");
  const permission = await resolveUserPermission(session.userId, "operations.invoices");
  if (!hasPermissionLevel(permission, "EDIT")) redirect("/invoices");
  const options = await getInvoiceFormOptions();

  return <InvoiceEditor options={options} />;
}
