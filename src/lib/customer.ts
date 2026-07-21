import { prisma } from "@/lib/prisma";
import { CUSTOMER_STATUS_ORDER, isCustomerStatus } from "@/lib/constants";
import { writeAdminAudit } from "@/lib/adminObservability";
export { capitalizeBrandName } from "@/lib/brandName";

// ---- JSON field helpers ---------------------------------------------------

export type SiteLink = { link: string; price: string; asin: string };
export type SiteLinks = Record<string, SiteLink>;

export function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function parseSiteLinks(value: string | null | undefined): SiteLinks {
  if (!value) return {};
  try {
    const v = JSON.parse(value);
    return v && typeof v === "object" ? (v as SiteLinks) : {};
  } catch {
    return {};
  }
}

export function parseRecord(
  value: string | null | undefined,
): Record<string, string> {
  if (!value) return {};
  try {
    const v = JSON.parse(value);
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// ---- Status timer rules ---------------------------------------------------
//
// Evaluated lazily on list / dashboard load. Every transition is claimed with
// a conditional update so concurrent page loads cannot create duplicate alerts.

const DAY = 24 * 60 * 60 * 1000;

export async function runCustomerStatusChecks(): Promise<void> {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * DAY);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);
  const reviewableStatuses = [
    "UNASSIGNED",
    "DEMO_IN_PROGRESS",
    "DEMO_DONE",
    "INTERNAL_DISCUSSION",
  ];

  // Demo submitted for three days without another progress event.
  const demoDoneCustomers = await prisma.customer.findMany({
    where: {
      status: "DEMO_DONE",
      statusChangedAt: { lte: threeDaysAgo },
      deletedAt: null,
    },
    select: { id: true, brandName: true, statusChangedAt: true },
  });
  for (const customer of demoDoneCustomers) {
    const changed = await prisma.customer.updateMany({
      where: {
        id: customer.id,
        status: "DEMO_DONE",
        statusChangedAt: customer.statusChangedAt,
        deletedAt: null,
      },
      data: { status: "INTERNAL_DISCUSSION", statusChangedAt: now },
    });
    if (changed.count === 1) {
      await writeAdminAudit({
        action: "AUTO_CUSTOMER_STATUS_CHANGE",
        module: "customers",
        targetType: "Customer",
        targetId: customer.id,
        targetLabel: customer.brandName,
        summary: `客户「${customer.brandName}」Demo 方案完成 3 天无新进度，自动转为客户内部讨论中`,
        before: { status: "DEMO_DONE" },
        after: { status: "INTERNAL_DISCUSSION" },
        metadata: { rule: "DEMO_DONE_3_DAYS" },
      });
    }
  }

  // A creator ignored the 30-day review reminder for its full grace period.
  const expiredReviews = await prisma.customer.findMany({
    where: {
      status: { in: reviewableStatuses },
      staleReviewRequestedAt: { not: null },
      staleReviewDeadlineAt: { lte: now },
      deletedAt: null,
    },
    select: { id: true, brandName: true, status: true, statusChangedAt: true, staleReviewRequestedAt: true },
  });
  for (const customer of expiredReviews) {
    if (!customer.staleReviewRequestedAt || customer.statusChangedAt > customer.staleReviewRequestedAt) continue;
    const changed = await prisma.customer.updateMany({
      where: {
        id: customer.id,
        status: { in: reviewableStatuses },
        statusChangedAt: customer.statusChangedAt,
        staleReviewRequestedAt: customer.staleReviewRequestedAt,
        staleReviewDeadlineAt: { lte: now },
        deletedAt: null,
      },
      data: {
        status: "NOT_ADVANCED",
        statusChangedAt: now,
        staleReviewDeadlineAt: null,
      },
    });
    if (changed.count === 1) {
      await writeAdminAudit({
        action: "AUTO_CUSTOMER_STATUS_CHANGE",
        module: "customers",
        targetType: "Customer",
        targetId: customer.id,
        targetLabel: customer.brandName,
        summary: `客户「${customer.brandName}」30 天进度提醒后 3 天无操作，自动转为未推进合作`,
        before: { status: customer.status },
        after: { status: "NOT_ADVANCED" },
        metadata: { rule: "STALE_REVIEW_3_DAY_GRACE" },
      });
    }
  }

  // Claim each first reminder and create it in the same transaction.
  const needsReview = await prisma.customer.findMany({
    where: {
      status: { in: reviewableStatuses },
      createdAt: { lte: thirtyDaysAgo },
      createdById: { not: null },
      staleReviewRequestedAt: null,
      deletedAt: null,
    },
    select: { id: true, brandName: true, createdById: true },
  });
  for (const customer of needsReview) {
    if (!customer.createdById) continue;
    const creatorId = customer.createdById;
    const deadline = new Date(now.getTime() + 3 * DAY);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.customer.updateMany({
        where: { id: customer.id, staleReviewRequestedAt: null, deletedAt: null },
        data: { staleReviewRequestedAt: now, staleReviewDeadlineAt: deadline },
      });
      if (claimed.count !== 1) return;
      await tx.reminder.create({
        data: {
          title: `客户进度确认：${customer.brandName}`,
          content: "该客户创建已超过 30 天，请确认是否继续推进。若 3 天内没有调整客户进度，将自动转为「未推进合作」。",
          remindDate: now,
          type: "STATUS_CHECK",
          targetId: creatorId,
          createdById: creatorId,
        },
      });
    });
  }
}

// ---- Event-driven status bump ---------------------------------------------
//
// When a contract or task event happens we bump the customer's status forward
// (never backward) so the current progress reflects task & contract state.

export async function bumpCustomerStatus(
  customerId: string,
  toStatus: string,
): Promise<void> {
  if (!isCustomerStatus(toStatus) || toStatus === "COOPERATION_DONE") return;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { status: true },
  });
  if (!customer || customer.status === "COOPERATION_DONE") return;

  const currentRank = CUSTOMER_STATUS_ORDER.indexOf(customer.status);
  const nextRank = CUSTOMER_STATUS_ORDER.indexOf(toStatus);
  // Only move forward along the pipeline; PENDING / NOT_ADVANCED (rank -1)
  // are always overridden by a real pipeline event.
  if (nextRank > currentRank || currentRank === -1) {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        status: toStatus,
        statusChangedAt: new Date(),
        staleReviewDeadlineAt: null,
      },
    });
  }
}
