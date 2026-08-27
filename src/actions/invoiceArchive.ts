"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { isStaff, financeReferenceCustomerScope } from "@/lib/dataScope";
import { saveUploadedFile } from "@/lib/upload";
import { releaseDeletedInvoiceNumber } from "@/lib/businessNumberRelease";

export type ArchiveActionResult = { ok: boolean; error?: string; invoiceId?: string };

function text(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

async function requireInternal(feature: string, level: "READ" | "EDIT" | "MANAGE") {
  const session = await requireSession();
  if (!isStaff(session.role)) throw new Error("仅内部员工可执行此操作");
  await requireFeaturePermission(session, feature, level);
  return session;
}

export async function uploadInvoiceArchive(fd: FormData): Promise<ArchiveActionResult> {
  try {
    const session = await requireInternal("finance.invoices", "EDIT");
    const invoiceNo = text(fd, "invoiceNo").replace(/\s+/g, "").toUpperCase();
    const customerId = text(fd, "customerId");
    const contractId = text(fd, "contractId");
    const file = fd.get("file");
    if (!invoiceNo) return { ok: false, error: "请填写 Invoice 编号" };
    if (!customerId) return { ok: false, error: "请选择关联客户" };
    if (!contractId) return { ok: false, error: "请选择关联合同" };
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "请上传 Invoice 原件" };
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null, ...financeReferenceCustomerScope(session) },
      select: { id: true, brandName: true },
    });
    if (!customer) return { ok: false, error: "客户不存在或无权访问" };
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, customerId, deletedAt: null },
      select: { id: true },
    });
    if (!contract) return { ok: false, error: "所选合同不属于该客户" };
    const saved = await saveUploadedFile(file);
    const now = new Date();
    try {
      const invoice = await prisma.$transaction(async (tx) => {
        if (!(await releaseDeletedInvoiceNumber(tx, invoiceNo))) {
          throw new Error("ACTIVE_NUMBER_CONFLICT");
        }
        const created = await tx.invoice.create({
          data: {
            invoiceNo, customerId, contractId, createdById: session.userId,
            documentType: "INVOICE", issuedAt: now, invoiceDate: now, dueDate: now,
            periodType: "DATE_RANGE", periodLabel: "", feeType: "ARCHIVE_ONLY",
            clientName: customer.brandName, currency: "USD", totalAmount: 0,
            bankSnapshot: "{}", status: "ISSUED", originalFileUrl: saved.fileUrl,
            archiveOnly: true, archiveSource: "MANUAL_UPLOAD",
            contractLinks: { create: [{ contractId, sortOrder: 0 }] },
          },
          select: { id: true },
        });
        await tx.attachment.create({ data: {
          fileName: saved.fileName, fileUrl: saved.fileUrl, fileSize: saved.fileSize,
          entityType: "INVOICE", entityId: created.id, uploadedById: session.userId,
        } });
        await tx.financeAuditLog.create({ data: {
          entityType: "INVOICE", entityId: created.id, action: "MANUAL_ARCHIVE_UPLOAD",
          actorId: session.userId, toStatus: "ISSUED",
          metadata: JSON.stringify({ invoiceNo, customerId, contractId, fileName: saved.fileName }),
        } });
        return created;
      });
      revalidatePath("/invoices");
      return { ok: true, invoiceId: invoice.id };
    } catch (error) {
      if (error instanceof Error && error.message === "ACTIVE_NUMBER_CONFLICT") {
        return { ok: false, error: "该 Invoice 编号已存在" };
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: false, error: "该 Invoice 编号已存在" };
      }
      throw error;
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "上传失败" };
  }
}

export async function linkInvoiceToReconciliation(
  reconciliationId: string,
  invoiceId: string,
): Promise<ArchiveActionResult> {
  try {
    const session = await requireInternal("finance.customer_reconciliation", "EDIT");
    const reconciliation = await prisma.customerReconciliation.findFirst({
      where: { id: reconciliationId, deletedAt: null, status: "CONFIRMED" },
      select: { id: true, customerId: true, contractId: true, invoiceLinks: { select: { id: true } } },
    });
    if (!reconciliation) return { ok: false, error: "仅已确认的客户对账可关联票据" };
    if (reconciliation.invoiceLinks.length) return { ok: false, error: "该对账记录已经关联票据" };
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId, deletedAt: null, status: "ISSUED", customerId: reconciliation.customerId,
        OR: [{ contractId: reconciliation.contractId }, { contractLinks: { some: { contractId: reconciliation.contractId } } }],
      },
      select: { id: true, invoiceNo: true, documentType: true },
    });
    if (!invoice) return { ok: false, error: "票据不存在，或客户、合同与对账记录不一致" };
    try {
      await prisma.$transaction(async (tx) => {
        await tx.invoiceReconciliation.create({ data: { invoiceId, reconciliationId, sortOrder: 0 } });
        await tx.financeAuditLog.create({ data: {
          entityType: "CUSTOMER_RECONCILIATION", entityId: reconciliationId,
          action: "MANUAL_LINK_BILLING_DOCUMENT", actorId: session.userId, toStatus: "INVOICED",
          metadata: JSON.stringify({ invoiceId, invoiceNo: invoice.invoiceNo, documentType: invoice.documentType }),
        } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: false, error: "该对账记录已经关联票据" };
      }
      throw error;
    }
    revalidatePath(`/finance/customers/${reconciliation.customerId}`);
    return { ok: true, invoiceId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "关联失败" };
  }
}

export async function createReceivableForArchivedInvoice(
  invoiceId: string,
  input: { amount: number; currency: string; dueDate: string; exchangeRate?: number; remark?: string },
): Promise<ArchiveActionResult> {
  try {
    const session = await requireInternal("finance.receivables", "EDIT");
    const amount = Number(input.amount);
    const currency = input.currency.trim().toUpperCase();
    const exchangeRate = Number(input.exchangeRate || 1);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "请填写大于 0 的应收金额" };
    if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "请选择有效币种" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return { ok: false, error: "请填写到期日" };
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return { ok: false, error: "汇率必须大于 0" };
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null, archiveOnly: true, status: "ISSUED" },
      select: { id: true, invoiceNo: true, invoiceDate: true, customerId: true, accountsReceivableId: true },
    });
    if (!invoice) return { ok: false, error: "手工存档 Invoice 不存在" };
    if (invoice.accountsReceivableId) return { ok: false, error: "该 Invoice 已关联应收账款" };
    const dueDate = new Date(`${input.dueDate}T00:00:00.000Z`);
    await prisma.$transaction(async (tx) => {
      const receivable = await tx.accountsReceivable.create({ data: {
        customerId: invoice.customerId, invoiceNo: invoice.invoiceNo,
        invoiceDate: invoice.invoiceDate, invoiceAmount: amount, currency,
        exchangeRate, amountRmb: Math.round(amount * exchangeRate * 100) / 100,
        dueDate, status: dueDate.getTime() < Date.now() ? "OVERDUE" : "NOT_DUE",
        remark: input.remark?.trim() || "由手工存档 Invoice 创建",
      } });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { accountsReceivableId: receivable.id, totalAmount: amount, currency, dueDate },
      });
      await tx.financeAuditLog.create({ data: {
        entityType: "ACCOUNTS_RECEIVABLE", entityId: receivable.id,
        action: "CREATE_FROM_ARCHIVED_INVOICE", actorId: session.userId, toStatus: receivable.status,
        metadata: JSON.stringify({ invoiceId, invoiceNo: invoice.invoiceNo, amount, currency, exchangeRate }),
      } });
    });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/finance/workbench");
    return { ok: true, invoiceId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "该 Invoice 已有同编号应收账款" };
    }
    return { ok: false, error: error instanceof Error ? error.message : "创建应收失败" };
  }
}
