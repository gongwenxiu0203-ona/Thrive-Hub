import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { requireSession } from "@/lib/session";
import { DomesticInvoiceForm } from "./DomesticInvoiceForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "登记国内发票 · Thrive Hub" };

export default async function DomesticInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const permission = await resolveUserPermission(session.userId, "operations.invoices");
  if (!hasPermissionLevel(permission, "EDIT")) redirect("/finance/workbench");
  const { id } = await params;
  const request = await prisma.billingRequest.findFirst({ where: { id, documentType: "DOMESTIC" }, include: {
    customer: { select: { brandName: true } }, applicant: { select: { name: true } },
    lines: { orderBy: { sortOrder: "asc" }, select: { id: true, feeType: true, currency: true, requestedAmount: true, reconciliation: { select: { periodStart: true, periodEnd: true } } } },
    manualItems: { orderBy: { sortOrder: "asc" } }, invoices: { where: { deletedAt: null }, take: 1, select: { id: true } },
  } });
  if (!request) notFound();
  if (request.invoices[0]) redirect(`/invoices/${request.invoices[0].id}`);
  if (request.status !== "PROCESSING") redirect("/finance/workbench");
  const lines = request.lines.length
    ? request.lines.map((line) => ({ id: line.id, feeType: line.feeType, currency: line.currency, requestedAmount: line.requestedAmount, periodStart: line.reconciliation.periodStart.toISOString(), periodEnd: line.reconciliation.periodEnd.toISOString() }))
    : request.manualItems.map((item) => ({ id: item.id, feeType: item.feeType === "SALES_COMMISSION" ? "COMMISSION" : "FIXED_FEE", currency: item.currency, requestedAmount: item.amount, periodStart: item.periodLabel, periodEnd: item.periodLabel }));
  return <div className="space-y-6"><div><Link href="/finance/workbench" className="text-sm text-brand-700 hover:underline">← 返回财务工作台</Link><h1 className="mt-3 text-2xl font-semibold text-slate-950">登记国内发票</h1><p className="mt-1 text-sm text-slate-600">{request.requestNo} · {request.customer.brandName} · 申请人 {request.applicant.name}</p></div><DomesticInvoiceForm request={{ id: request.id, requestNo: request.requestNo, currency: request.currency, requestedAmount: request.requestedAmount, lines }} /></div>;
}
