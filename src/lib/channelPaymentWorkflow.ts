import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTwoStageFinanceApproval } from "@/lib/financeApproval";

const marker = (periodId: string) => `[CHANNEL_PERIOD:${periodId}]`;

export async function ensureChannelPaymentRequest(
  tx: Prisma.TransactionClient,
  periodId: string,
  documentId: string,
  actorId: string,
) {
  const existing = await tx.paymentRequest.findFirst({ where: { note: { contains: marker(periodId) }, status: { not: "CANCELLED" } }, select: { id: true } });
  if (existing) return existing;
  const period = await tx.channelReconciliationPeriod.findUnique({
    where: { id: periodId },
    include: {
      reconciliation: { include: { customer: { select: { brandName: true } }, channelUser: { select: { id: true, name: true } } } },
      businessDocuments: { where: { id: documentId }, select: { id: true, documentType: true, fileUrl: true, documentNo: true, status: true, streamType: true } },
      payments: { where: { status: "PAID" }, select: { amount: true, streamType: true } },
      payableSources: { where: { status: "ACTIVE" }, include: { allocation: { select: { receiptId: true, invoiceId: true } } } },
    },
  });
  const document = period?.businessDocuments[0];
  if (!period || !document || !["PENDING", "APPROVED"].includes(document.status)) throw new Error("渠道 INVOICE 不存在或已被驳回。");
  if (!document.documentType.toUpperCase().includes("INVOICE")) throw new Error("渠道确认后必须提交 INVOICE 类型凭证，其他凭证不能创建付款申请。");
  if (period.channelReviewStatus !== "CONFIRMED") throw new Error("仅渠道确认无异议的周期可以创建付款申请。");
  if (!period.payableSources.length) throw new Error("该渠道周期没有有效客户到账释放来源，不能创建付款申请。");
  const streamType = document.streamType === "FIXED_FEE" || document.streamType === "COMMISSION" ? document.streamType : period.streamType;
  const due = streamType === "FIXED_FEE" ? (period.fixedFeeShareAmount ?? 0) : streamType === "COMMISSION" ? (period.commissionShareAmount ?? 0) : (period.fixedFeeShareAmount ?? 0) + (period.commissionShareAmount ?? 0);
  const paid = period.payments.filter((row) => streamType === "BOTH" || row.streamType === streamType || row.streamType === "BOTH").reduce((sum, row) => sum + row.amount, 0);
  const amount = Math.round((due - paid + Number.EPSILON) * 100) / 100;
  if (amount <= 0) throw new Error("该渠道周期没有待付余额。");
  const currency = streamType === "COMMISSION" ? (period.commissionReceivedCurrency ?? "USD") : (period.fixedFeeReceivedCurrency ?? "USD");
  const payer = await tx.financeAccountProfile.findFirst({ where: { status: "ACTIVE", currency: currency === "RMB" ? "CNY" : currency, isDefault: true }, orderBy: { createdAt: "asc" } });
  if (!payer) throw new Error(`未配置 ${currency} 的默认付款账户，不能自动创建付款申请。`);
  const supplierName = period.reconciliation.channelUser.name;
  let supplier = await tx.supplier.findFirst({ where: { name: supplierName, type: "CHANNEL", status: "ACTIVE" }, select: { id: true } });
  if (!supplier) supplier = await tx.supplier.create({ data: { supplierNo: `SUP-CH-${period.reconciliation.channelUserId}`, name: supplierName, type: "CHANNEL" }, select: { id: true } });
  const source = period.payableSources[0];
  const created = await tx.paymentRequest.create({
    data: {
      requestNo: `PAY-CH-${period.id}-${streamType}`, requestType: "CHANNEL", applicantId: period.reconciliation.channelUserId, supplierId: supplier.id,
      payerEntity: payer.legalEntity, payerAccountKey: payer.payerAccountKey ?? payer.id,
      payeeSnapshot: period.reconciliation.channelPayeeSnapshot, reason: `渠道分账付款 · ${period.reconciliation.customer.brandName} · ${period.periodLabel ?? `第${period.periodIndex}期`}`,
      currency: currency === "RMB" ? "CNY" : currency, amount, relatedInvoiceId: source.allocation.invoiceId, relatedReceiptId: source.allocation.receiptId,
      note: `${marker(periodId)} 自动生成；渠道凭证 ${document.documentNo ?? document.id}`,
      items: { create: { description: `${streamType} 渠道分账`, amount, currency: currency === "RMB" ? "CNY" : currency, invoiceUrls: JSON.stringify([document.fileUrl]) } },
    }, select: { id: true },
  });
  await createTwoStageFinanceApproval(tx, "PAYMENT_REQUEST", created.id);
  await tx.financeAttachment.create({ data: { entityType: "PAYMENT_REQUEST", entityId: created.id, attachmentType: "CHANNEL_INVOICE", fileUrl: document.fileUrl, uploadedById: actorId } });
  await tx.financeAuditLog.create({ data: { entityType: "PAYMENT_REQUEST", entityId: created.id, action: "AUTO_CREATE_FROM_CHANNEL_INVOICE", actorId, toStatus: "SUBMITTED", metadata: JSON.stringify({ periodId, documentId }) } });
  return created;
}

export async function ensureChannelInvoiceReminders() {
  const deadline = new Date(); deadline.setDate(deadline.getDate() - 3);
  const periods = await prisma.channelReconciliationPeriod.findMany({
    where: {
      channelReviewStatus: "CONFIRMED",
      channelReviewedAt: { lte: deadline },
      businessDocuments: {
        none: {
          documentType: { contains: "INVOICE" },
          status: { in: ["PENDING", "APPROVED"] },
        },
      },
    },
    include: {
      reconciliation: {
        select: {
          channelUserId: true,
          customer: { select: { brandName: true } },
        },
      },
    },
    take: 200,
  });
  for (const period of periods) {
    const payment = await prisma.paymentRequest.findFirst({ where: { note: { contains: marker(period.id) }, status: { not: "CANCELLED" } }, select: { id: true } });
    if (payment) continue;
    const title = `【待提交渠道发票】${period.id} · V${period.channelReviewVersion}`;
    await prisma.$transaction(async (tx) => {
      const current = await tx.channelReconciliationPeriod.findFirst({ where: { id: period.id, channelReviewStatus: "CONFIRMED", channelReviewVersion: period.channelReviewVersion }, select: { id: true } });
      if (!current) return;
      const exists = await tx.reminder.findFirst({ where: { targetId: period.reconciliation.channelUserId, title, deletedAt: null }, select: { id: true } });
      if (!exists) await tx.reminder.create({ data: { title, content: `${period.reconciliation.customer.brandName} 的渠道对账确认无异议已满 3 个自然日，请上传 INVOICE 凭证以进入财务付款流程。渠道周期：${period.periodLabel ?? period.id}`, remindDate: new Date(), type: "FOLLOWUP", targetId: period.reconciliation.channelUserId, createdById: period.reconciliation.channelUserId } });
    });
  }
}
