import { prisma } from "@/lib/prisma";

const REMINDER_TYPE = "INVOICE_ISSUE_OVERDUE";
const MAX_REMINDERS_PER_SCAN = 50;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function marker(reconciliationId: string): string {
  return `[reconciliation:${reconciliationId}]`;
}

/**
 * Creates at most one reminder for each confirmed reconciliation that has
 * remained without a formally issued Invoice for three full days.
 *
 * This runs for the signed-in creator from the authenticated app layout. A
 * draft or void Invoice does not satisfy the requirement; an ISSUED Invoice
 * does. Deleted reminders still count as already sent, so deleting a reminder
 * cannot create a notification loop.
 */
export async function ensureOverdueInvoiceIssueReminders(
  userId: string,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - THREE_DAYS_MS);
  const candidates = await prisma.customerReconciliation.findMany({
    where: {
      createdById: userId,
      status: "CONFIRMED",
      deletedAt: null,
      reviews: {
        some: {
          action: { in: ["APPROVED", "FINAL_CONFIRMED"] },
          createdAt: { lte: cutoff },
        },
      },
      invoiceLinks: {
        none: {
          invoice: { status: "ISSUED", deletedAt: null },
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: MAX_REMINDERS_PER_SCAN,
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      customer: { select: { brandName: true } },
      reviews: {
        where: { action: { in: ["APPROVED", "FINAL_CONFIRMED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  let created = 0;
  await prisma.$transaction(async (tx) => {
    for (const reconciliation of candidates) {
      const confirmedAt = reconciliation.reviews[0]?.createdAt;
      if (!confirmedAt || confirmedAt > cutoff) continue;

      // Recheck the Invoice state inside the write transaction so an Invoice
      // issued during the scan does not receive a new overdue reminder.
      const issuedLink = await tx.invoiceReconciliation.findFirst({
        where: {
          reconciliationId: reconciliation.id,
          invoice: { status: "ISSUED", deletedAt: null },
        },
        select: { id: true },
      });
      if (issuedLink) continue;

      const reminderMarker = marker(reconciliation.id);
      const existing = await tx.reminder.findFirst({
        where: {
          targetId: userId,
          type: REMINDER_TYPE,
          content: { contains: reminderMarker },
        },
        select: { id: true },
      });
      if (existing) continue;

      const period = `${reconciliation.periodStart.toISOString().slice(0, 10)} ~ ${reconciliation.periodEnd.toISOString().slice(0, 10)}`;
      await tx.reminder.create({
        data: {
          title: `【待开具 Invoice】${reconciliation.customer.brandName}`,
          content: `客户对账已确认满 3 个自然日，但尚未开具正式 Invoice。请尽快处理。对账周期：${period}。${reminderMarker}`,
          remindDate: now,
          type: REMINDER_TYPE,
          targetId: userId,
          createdById: userId,
        },
      });
      created += 1;
    }
  });

  return created;
}
