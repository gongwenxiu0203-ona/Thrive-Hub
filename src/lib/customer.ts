import { prisma } from "@/lib/prisma";
import { CUSTOMER_STATUS_ORDER } from "@/lib/constants";

// ---- JSON field helpers ---------------------------------------------------

export type SiteLink = { link: string; price: string; asin: string };
export type SiteLinks = Record<string, SiteLink>;

export function capitalizeBrandName(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.trim();
  if (!s) return "";
  return s.charAt(0).toLocaleUpperCase() + s.slice(1).toLocaleLowerCase();
}

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
// Spec:
//  - DEMO_DONE 超过 14 天未变动 → 推送商务负责人确认 + 转「待定」
//  - INTERNAL_DISCUSSION 超过 7 天未变动 → 推送商务负责人确认 + 转「待定」
//  - PENDING 超过 3 天未变动 → 转「未推进合作」
//
// Evaluated lazily on list / dashboard load (no external cron required).

const DAY = 24 * 60 * 60 * 1000;

export async function runCustomerStatusChecks(): Promise<void> {
  const now = Date.now();
  const candidates = await prisma.customer.findMany({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where: { status: { in: ["DEMO_DONE", "INTERNAL_DISCUSSION", "PENDING"] }, deletedAt: null } as any,
    select: {
      id: true,
      status: true,
      statusChangedAt: true,
      brandName: true,
      businessOwnerId: true,
    },
  });

  for (const c of candidates) {
    const ageDays = (now - new Date(c.statusChangedAt).getTime()) / DAY;

    if (c.status === "DEMO_DONE" && ageDays >= 14) {
      await transitionToPending(c, "Demo方案已完成超过 14 天未推进");
    } else if (c.status === "INTERNAL_DISCUSSION" && ageDays >= 7) {
      await transitionToPending(c, "客户内部讨论中超过 7 天未推进");
    } else if (c.status === "PENDING" && ageDays >= 3) {
      await prisma.customer.update({
        where: { id: c.id },
        data: { status: "NOT_ADVANCED", statusChangedAt: new Date() },
      });
    }
  }
}

async function transitionToPending(
  c: {
    id: string;
    brandName: string;
    businessOwnerId: string | null;
  },
  reason: string,
): Promise<void> {
  await prisma.customer.update({
    where: { id: c.id },
    data: { status: "PENDING", statusChangedAt: new Date() },
  });
  // Notify the business owner to confirm the customer's state.
  if (c.businessOwnerId) {
    await prisma.reminder.create({
      data: {
        title: `客户状态确认：${c.brandName}`,
        content: `${reason}，已自动转为「待定」，请确认客户状态。若 3 天内仍无变动将转为「未推进合作」。`,
        remindDate: new Date(),
        type: "STATUS_CHECK",
        targetId: c.businessOwnerId,
        createdById: c.businessOwnerId,
      },
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
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { status: true },
  });
  if (!customer) return;

  const currentRank = CUSTOMER_STATUS_ORDER.indexOf(customer.status);
  const nextRank = CUSTOMER_STATUS_ORDER.indexOf(toStatus);
  // Only move forward along the pipeline; PENDING / NOT_ADVANCED (rank -1)
  // are always overridden by a real pipeline event.
  if (nextRank > currentRank || currentRank === -1) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { status: toStatus, statusChangedAt: new Date() },
    });
  }
}
