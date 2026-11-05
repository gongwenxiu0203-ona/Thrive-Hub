import type { Prisma } from "@prisma/client";

export function containsExactPaymentProof(serialized: string, fileUrl: string) {
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) && parsed.some(value => value === fileUrl);
  } catch { return false; }
}

/** Read-only compatibility for receipts saved before FinanceAttachment linking. */
export async function findLegacyPaymentProof(
  db: Pick<Prisma.TransactionClient, "paymentRequest" | "expenseClaim">,
  fileUrl: string,
): Promise<{ entityType: "PAYMENT_REQUEST" | "EXPENSE_CLAIM"; entityId: string; uploadedById: string } | null> {
  if (!/^\/uploads\/[^/\\]+$/.test(fileUrl)) return null;
  const payments = await db.paymentRequest.findMany({ where: { status: "PAID", paymentProofUrls: { contains: fileUrl } }, select: { id: true, applicantId: true, paymentProofUrls: true } });
  const payment = payments.find(row => containsExactPaymentProof(row.paymentProofUrls, fileUrl));
  if (payment) return { entityType: "PAYMENT_REQUEST", entityId: payment.id, uploadedById: payment.applicantId };
  const expenses = await db.expenseClaim.findMany({ where: { status: "PAID", paymentProofUrls: { contains: fileUrl } }, select: { id: true, employeeId: true, paymentProofUrls: true } });
  const expense = expenses.find(row => containsExactPaymentProof(row.paymentProofUrls, fileUrl));
  return expense ? { entityType: "EXPENSE_CLAIM", entityId: expense.id, uploadedById: expense.employeeId } : null;
}
