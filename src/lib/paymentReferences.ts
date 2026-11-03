import type { Prisma } from "@prisma/client";

/** Validate supplied references without requiring the missing counterpart. */
export async function validateOptionalPaymentReferences(
  tx: Pick<Prisma.TransactionClient, "invoice" | "customerReceipt">,
  invoiceId?: string,
  receiptId?: string,
) {
  const invoice = invoiceId ? await tx.invoice.findFirst({
    where: { id: invoiceId, status: "ISSUED", deletedAt: null },
    select: { id: true, accountsReceivableId: true, customerId: true },
  }) : null;
  if (invoiceId && !invoice) throw new Error("关联票据不存在或尚未开票。");
  if (receiptId) {
    const receipt = await tx.customerReceipt.findFirst({
      where: {
        id: receiptId, status: { not: "REVERSED" },
        ...(invoice ? {
          customerId: invoice.customerId ?? undefined,
          allocations: { some: {
            status: "ACTIVE", allocatedAmount: { gt: 0 },
            OR: [{ invoiceId: invoice.id }, { accountsReceivableId: invoice.accountsReceivableId ?? "__none__" }],
          } },
        } : {}),
      },
      select: { id: true },
    });
    if (!receipt) throw new Error(invoice
      ? "关联客户到账记录尚未有效核销到该票据，不能提交渠道或联盟付款。"
      : "关联客户到账记录不存在或已冲销，请重新选择。");
  }
}
