"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { financeDataView, isStaff, reconciliationScope } from "@/lib/dataScope";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";
import { createTwoStageFinanceApproval } from "@/lib/financeApproval";

const REQUEST_STATUSES = ["SUBMITTED", "PROCESSING"];

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function currency(value: string) {
  const normalized =
    value === "人民币" || value === "RMB"
      ? "CNY"
      : value === "美金"
        ? "USD"
        : value;
  return normalized.trim().toUpperCase();
}

function requestNo() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `BR-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export type SubmitBillingRequestInput = {
  reconciliationIds: string[];
  documentType: "INVOICE" | "DOMESTIC";
  mergeMode: "MERGED" | "SEPARATE";
  note?: string;
};

export async function submitBillingRequest(input: SubmitBillingRequestInput) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(
      session,
      "finance.customer_reconciliation",
      "EDIT",
    );
    if (!isStaff(session.role))
      return { ok: false, error: "仅内部员工可以提交开票申请。" };
    const ids = [
      ...new Set(
        input.reconciliationIds.map((id) => id.trim()).filter(Boolean),
      ),
    ];
    if (!ids.length || ids.length > 100)
      return { ok: false, error: "请选择 1 至 100 条对账记录。" };
    if (!["INVOICE", "DOMESTIC"].includes(input.documentType))
      return { ok: false, error: "票据类型无效。" };
    if (!["MERGED", "SEPARATE"].includes(input.mergeMode))
      return { ok: false, error: "开票方式无效。" };

    const rows = await prisma.customerReconciliation.findMany({
      where: {
        AND: [
          { id: { in: ids }, deletedAt: null },
          reconciliationScope(session, financeDataView(session)),
        ],
      },
      include: {
        contract: { select: { id: true, partyA: true } },
        billingRequestLines: {
          where: { request: { status: { in: REQUEST_STATUSES } } },
        },
      },
    });
    if (rows.length !== ids.length)
      return { ok: false, error: "部分对账记录不存在或不在你的数据范围内。" };
    if (rows.some((row) => row.status !== "CONFIRMED"))
      return { ok: false, error: "只有已完成确认的对账记录可以提交开票申请。" };
    if (rows.some((row) => row.reconcileType === "BOTH"))
      return {
        ok: false,
        error: "历史合并对账不能直接申请，请选择独立的固费或销售佣金记录。",
      };
    if (rows.some((row) => row.billingRequestLines.length > 0))
      return {
        ok: false,
        error: "所选记录中已有待处理的开票申请，请勿重复提交。",
      };
    const customerIds = new Set(rows.map((row) => row.customerId));
    const currencies = new Set(
      rows.map((row) =>
        currency(
          row.reconcileType === "FEE_ONLY"
            ? row.fixedFeeCurrency
            : row.commissionCurrency,
        ),
      ),
    );
    if (customerIds.size !== 1)
      return { ok: false, error: "一次申请只能包含同一客户的对账记录。" };
    if (input.mergeMode === "MERGED" && currencies.size !== 1)
      return { ok: false, error: "合并开票要求所有记录币种一致。" };

    const groups =
      input.mergeMode === "SEPARATE" ? rows.map((row) => [row]) : [rows];
    const created = await prisma.$transaction(async (tx) => {
      const results: Array<{ id: string; requestNo: string }> = [];
      for (const group of groups) {
        const requestedAmount = money(
          group.reduce(
            (sum, row) =>
              sum +
              (row.reconcileType === "FEE_ONLY"
                ? row.feeAmount
                : (row.finalCommissionAmount ?? row.commissionAmount)),
            0,
          ),
        );
        if (requestedAmount <= 0) throw new Error("开票申请金额必须大于 0。");
        const request = await tx.billingRequest.create({
          data: {
            requestNo: requestNo(),
            applicantId: session.userId,
            customerId: group[0].customerId,
            contractId:
              new Set(group.map((row) => row.contractId)).size === 1
                ? group[0].contractId
                : null,
            legalEntityKey:
              group[0].contract.partyA?.trim() || group[0].customerId,
            documentType: input.documentType,
            mergeMode: input.mergeMode,
            currency: currencies.size === 1 ? [...currencies][0] : "MIXED",
            requestedAmount,
            sourceType: "RECONCILIATION",
            applicantNote: input.note?.trim() || null,
            lines: {
              create: group.map((row, sortOrder) => ({
                reconciliationId: row.id,
                requestedAmount: money(
                  row.reconcileType === "FEE_ONLY"
                    ? row.feeAmount
                    : (row.finalCommissionAmount ?? row.commissionAmount),
                ),
                feeType:
                  row.reconcileType === "FEE_ONLY" ? "FIXED_FEE" : "COMMISSION",
                currency: currency(
                  row.reconcileType === "FEE_ONLY"
                    ? row.fixedFeeCurrency
                    : row.commissionCurrency,
                ),
                sortOrder,
              })),
            },
          },
          select: { id: true, requestNo: true },
        });
        await createTwoStageFinanceApproval(tx, "BILLING_REQUEST", request.id);
        results.push(request);
      }
      return results;
    });
    revalidatePath("/finance/billing");
    return { ok: true, requests: created };
  } catch (error) {
    console.error("[submit-billing-request]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "提交开票申请失败。",
    };
  }
}

export async function acceptBillingRequest(id: string) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "operations.invoices", "EDIT");
    if (!isStaff(session.role))
      return { ok: false, error: "仅内部财务人员可以受理开票申请。" };
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.billingRequest.findUnique({
        where: { id },
        select: { applicantId: true, status: true },
      });
      if (!request || request.status !== "SUBMITTED") return { count: 0 };
      if (request.applicantId === session.userId)
        throw new Error("申请人不得受理自己的开票申请。");
      const approved = await tx.financeApprovalStep.findUnique({
        where: {
          entityType_entityId_stepNo: {
            entityType: "BILLING_REQUEST",
            entityId: id,
            stepNo: 1,
          },
        },
        select: { status: true },
      });
      if (approved?.status !== "APPROVED")
        throw new Error("开票申请必须先由 Shallow 初审通过。");
      const changed = await tx.billingRequest.updateMany({
        where: { id, status: "SUBMITTED" },
        data: {
          status: "PROCESSING",
          acceptedById: session.userId,
          acceptedAt: new Date(),
        },
      });
      if (changed.count === 1)
        await tx.financeApprovalStep.updateMany({
          where: {
            entityType: "BILLING_REQUEST",
            entityId: id,
            stepNo: 2,
            status: "PENDING",
          },
          data: { operatorId: session.userId, comment: "财务已受理" },
        });
      return changed;
    });
    if (!result.count)
      return { ok: false, error: "申请不存在或已被其他人受理。" };
    revalidatePath("/finance/billing");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "受理失败。",
    };
  }
}

export async function getBillingRequestInvoiceIds(id: string) {
  const session = await requireSession();
  await requireFeaturePermission(session, "operations.invoices", "EDIT");
  const request = await prisma.billingRequest.findFirst({
    where: { id, status: { in: ["PROCESSING", "COMPLETED"] } },
    select: {
      id: true,
      documentType: true,
      sourceType: true,
      applicantNote: true,
      customerId: true,
      contractId: true,
      customer: { select: { brandName: true } },
      manualItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          description: true,
          feeType: true,
          currency: true,
          periodType: true,
          periodLabel: true,
          promoPlatform: true,
          targetSite: true,
          affiliatePlatform: true,
          quantity: true,
          unitPrice: true,
          amount: true,
          sortOrder: true,
        },
      },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: { reconciliationId: true },
      },
      invoices: { where: { deletedAt: null }, take: 1, select: { id: true } },
    },
  });
  if (!request)
    return { ok: false as const, error: "请先在财务工作台受理该申请。" };
  if (request.documentType !== "INVOICE")
    return {
      ok: false as const,
      error: "国内发票申请暂不能进入 Invoice 编辑器。",
    };
  const invoiceMeta = (() => {
    const prefix = "INVOICE_META:";
    if (!request.applicantNote?.startsWith(prefix)) return {};
    try {
      return JSON.parse(request.applicantNote.slice(prefix.length)) as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  })();
  const metaString = (key: string) =>
    typeof invoiceMeta[key] === "string" ? (invoiceMeta[key] as string) : null;
  return {
    ok: true as const,
    reconciliationIds: request.lines.map((line) => line.reconciliationId),
    existingInvoiceId: request.invoices[0]?.id,
    manualPrefill:
      request.sourceType === "MANUAL"
        ? {
            customerId: request.customerId,
            customerName: request.customer.brandName,
            contractId: request.contractId,
            bankAccountKey: metaString("bankAccountKey"),
            invoiceDate: metaString("invoiceDate"),
            dueDate: metaString("dueDate"),
            clientName: metaString("clientName"),
            clientAddress: metaString("clientAddress"),
            terms: metaString("terms"),
            items: request.manualItems,
          }
        : null,
  };
}

export async function deleteBillingRequest(id: string, reason?: string) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "operations.invoices", "MANAGE");
    const billing = await prisma.billingRequest.findUnique({
      where: { id },
      include: {
        invoices: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            accountsReceivableId: true,
            receiptAllocations: {
              where: { status: "ACTIVE" },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!billing || billing.status === "CANCELLED")
      return { ok: false, error: "记录不存在或已经删除。" };
    const confirmed = billing.status !== "SUBMITTED";
    const cleanReason = String(reason ?? "").trim();
    if (confirmed && cleanReason.length < 2)
      return { ok: false, error: "受理或确认后的记录必须填写删除原因。" };
    const now = new Date();
    const invoiceIds = billing.invoices.map((invoice) => invoice.id);
    await prisma.$transaction(async (tx) => {
      if (invoiceIds.length) {
        await tx.domesticInvoiceDocument.updateMany({
          where: { invoiceId: { in: invoiceIds } },
          data: { voidedAt: now },
        });
        await tx.invoice.updateMany({
          where: { id: { in: invoiceIds } },
          data: { status: "VOID", deletedAt: now },
        });
      }
      await tx.billingRequest.update({
        where: { id },
        data: {
          status: "CANCELLED",
          rejectionReason: cleanReason || "管理员删除",
        },
      });
      await tx.financeAuditLog.create({
        data: {
          entityType: "BILLING_REQUEST",
          entityId: id,
          action: "ADMIN_DELETE",
          fromStatus: billing.status,
          toStatus: "CANCELLED",
          actorId: session.userId,
          note: cleanReason || "管理员删除",
          metadata: JSON.stringify({
            requestNo: billing.requestNo,
            invoiceIds,
            activeReceiptAllocationCount: billing.invoices.reduce(
              (sum, invoice) => sum + invoice.receiptAllocations.length,
              0,
            ),
          }),
        },
      });
    });
    revalidatePath("/finance/workbench");
    revalidatePath("/finance/billing");
    return { ok: true };
  } catch (error) {
    console.error("[delete-billing-request]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "删除开票申请失败。",
    };
  }
}
