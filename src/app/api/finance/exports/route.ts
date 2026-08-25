import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { isStaff } from "@/lib/permissions";
import { customerScope, financeDataView } from "@/lib/dataScope";
import { createFinanceExportZip, parseUrlJson } from "@/lib/financeExport";

type ExportType = "AR" | "PAYMENT_REQUEST" | "EXPENSE_CLAIM" | "PAYMENTS_AND_EXPENSES";
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!isStaff(session.role)) return NextResponse.json({ error: "仅内部员工可以导出财务记录。" }, { status: 403 });
    const body = await request.json() as { type?: string; section?: string; ids?: unknown[] };
    const type = (body.section === "ACCOUNTS_RECEIVABLE" ? "AR" : body.section === "PAYMENTS_AND_EXPENSES" ? "PAYMENTS_AND_EXPENSES" : body.type) as ExportType;
    const rawIds = Array.isArray(body.ids) ? body.ids : [];
    const ids: string[] = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{5,80}$/.test(id)))];
    if (!(["AR", "PAYMENT_REQUEST", "EXPENSE_CLAIM", "PAYMENTS_AND_EXPENSES"] as string[]).includes(type) || !ids.length || ids.length > 200) return NextResponse.json({ error: "请选择 1 至 200 条有效财务记录。" }, { status: 400 });
    const feature = type === "AR" ? "operations.accounts_receivable" : "finance.channel_reconciliation";
    const permission = await resolveUserPermission(session.userId, feature);
    if (!hasPermissionLevel(permission, "READ")) return NextResponse.json({ error: "无导出权限。" }, { status: 403 });
    const canViewAll = isStaff(session.role);
    const attachments: string[] = [];
    let rows: Array<Record<string, unknown>> = [];
    if (type === "AR") {
      const records = await prisma.accountsReceivable.findMany({ where: { id: { in: ids }, ...(canViewAll ? {} : { customer: customerScope(session, financeDataView(session)) }) }, include: { customer: { select: { brandName: true } }, invoices: { where: { deletedAt: null }, include: { domesticDocument: { select: { originalFileUrl: true } } } } } });
      if (records.length !== ids.length) return NextResponse.json({ error: "部分记录不存在或无权导出。" }, { status: 404 });
      rows = records.map((row) => ({ id: row.id, customer: row.customer?.brandName ?? "", invoiceNo: row.invoiceNo, invoiceDate: row.invoiceDate.toISOString(), dueDate: row.dueDate.toISOString(), currency: row.currency, invoiceAmount: row.invoiceAmount, receivedAmount: row.receivedAmount, balance: row.invoiceAmount - row.receivedAmount, status: row.status }));
      for (const row of records) for (const invoice of row.invoices) { if (invoice.pdfUrl) attachments.push(invoice.pdfUrl); if (invoice.domesticDocument?.originalFileUrl) attachments.push(invoice.domesticDocument.originalFileUrl); }
    } else if (type === "PAYMENT_REQUEST") {
      const records = await prisma.paymentRequest.findMany({ where: { id: { in: ids }, ...(canViewAll ? {} : { applicantId: session.userId }) }, include: { supplier: { select: { name: true } }, items: true } });
      if (records.length !== ids.length) return NextResponse.json({ error: "部分记录不存在或无权导出。" }, { status: 404 });
      rows = records.map((row) => ({ id: row.id, requestNo: row.requestNo, supplier: row.supplier?.name ?? "", requestType: row.requestType, reason: row.reason, currency: row.currency, amount: row.amount, status: row.status, scheduledAt: row.scheduledAt?.toISOString() ?? "", paidAt: row.paidAt?.toISOString() ?? "", transactionNo: row.transactionNo ?? "" }));
      for (const row of records) { attachments.push(...parseUrlJson(row.paymentProofUrls)); for (const item of row.items) attachments.push(...parseUrlJson(item.invoiceUrls)); }
    } else if (type === "EXPENSE_CLAIM") {
      const records = await prisma.expenseClaim.findMany({ where: { id: { in: ids }, ...(canViewAll ? {} : { employeeId: session.userId }) }, include: { items: true } });
      if (records.length !== ids.length) return NextResponse.json({ error: "部分记录不存在或无权导出。" }, { status: 404 });
      rows = records.map((row) => ({ id: row.id, claimNo: row.claimNo, employeeId: row.employeeId, reimbursementEntity: row.reimbursementEntity, currency: row.currency, totalAmount: row.totalAmount, status: row.status, paidAt: row.paidAt?.toISOString() ?? "" }));
      for (const row of records) { attachments.push(...parseUrlJson(row.paymentProofUrls)); for (const item of row.items) attachments.push(...parseUrlJson(item.invoiceUrls)); }
    } else {
      const [payments, expenses] = await Promise.all([
        prisma.paymentRequest.findMany({ where: { id: { in: ids }, ...(canViewAll ? {} : { applicantId: session.userId }) }, include: { supplier: { select: { name: true } }, items: true } }),
        prisma.expenseClaim.findMany({ where: { id: { in: ids }, ...(canViewAll ? {} : { employeeId: session.userId }) }, include: { items: true } }),
      ]);
      if (payments.length + expenses.length !== ids.length) return NextResponse.json({ error: "部分记录不存在或无权导出。" }, { status: 404 });
      rows = [
        ...payments.map((row) => ({ kind: "付款申请", id: row.id, requestNo: row.requestNo, category: row.requestType, object: row.supplier?.name ?? "", reason: row.reason, currency: row.currency, amount: row.amount, status: row.status, paidAt: row.paidAt?.toISOString() ?? "", transactionNo: row.transactionNo ?? "" })),
        ...expenses.map((row) => ({ kind: "费用报销", id: row.id, requestNo: row.claimNo, category: "EXPENSE", object: row.reimbursementEntity, reason: row.note ?? "", currency: row.currency, amount: row.totalAmount, status: row.status, paidAt: row.paidAt?.toISOString() ?? "", transactionNo: "" })),
      ];
      for (const row of payments) { attachments.push(...parseUrlJson(row.paymentProofUrls)); for (const item of row.items) attachments.push(...parseUrlJson(item.invoiceUrls)); }
      for (const row of expenses) { attachments.push(...parseUrlJson(row.paymentProofUrls)); for (const item of row.items) attachments.push(...parseUrlJson(item.invoiceUrls)); }
    }
    const financeAttachments = await prisma.financeAttachment.findMany({ where: type === "PAYMENTS_AND_EXPENSES" ? { entityType: { in: ["PAYMENT_REQUEST", "EXPENSE_CLAIM"] }, entityId: { in: ids } } : { entityType: type, entityId: { in: ids } }, select: { fileUrl: true } });
    attachments.push(...financeAttachments.map((row) => row.fileUrl));
    const zip = await createFinanceExportZip(rows, attachments);
    if (zip.length > 60 * 1024 * 1024) return NextResponse.json({ error: "导出文件超过 60MB，请减少选择记录。" }, { status: 413 });
    return new NextResponse(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="finance-${type.toLowerCase()}-${Date.now()}.zip"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[finance-export]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "导出失败。" }, { status: 500 });
  }
}
