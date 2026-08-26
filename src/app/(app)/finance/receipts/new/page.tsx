import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { isStaff } from "@/lib/permissions";
import { ReceiptEntryForm } from "./ReceiptEntryForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "登记客户到账 · Thraive" };

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ customerId?: string; arId?: string }> }) {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/finance");
  await requireFeaturePermission(session, "finance.receipt_allocation", "EDIT");
  const query = await searchParams;
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null }, orderBy: { brandName: "asc" },
    select: {
      id: true, brandName: true,
      accountsReceivable: { where: { status: { in: ["NOT_DUE", "PARTIAL", "OVERDUE"] } }, select: { id: true, invoiceNo: true, currency: true, invoiceAmount: true, receivedAmount: true, invoices: { select: { id: true, invoiceNo: true, billingAllocations: { select: { reconciliationId: true, feeType: true }, take: 1 } } } }, orderBy: { dueDate: "asc" } },
      reconciliations: { where: { status: "CONFIRMED", deletedAt: null }, select: { id: true, periodStart: true, periodEnd: true, reconcileType: true, fixedFeeCurrency: true, commissionCurrency: true }, orderBy: { periodStart: "desc" }, take: 40 },
    },
  });
  return <ReceiptEntryForm initialCustomerId={query.customerId ?? ""} initialArId={query.arId ?? ""} customers={customers.map((customer) => ({ ...customer, reconciliations: customer.reconciliations.map((row) => ({ ...row, periodStart: row.periodStart.toISOString(), periodEnd: row.periodEnd.toISOString() })) }))} />;
}
