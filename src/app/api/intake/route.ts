import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAIN_SITES, PROMO_PLATFORMS, PROMOTION_GOALS } from "@/lib/constants";
import { capitalizeBrandName } from "@/lib/customer";

const LEO_EMAIL = "leo.g@thraiveagency.com";
const LEDO_EMAIL = "ledo.h@thraiveagency.com";

async function userIdByEmail(email: string): Promise<string | null> {
  const u = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  return u?.id ?? null;
}

/** Mirror of notifyLeoOnCustomerCreate in actions/customers.ts (kept inline so
 *  the public intake route stays a single edge function with no server-action import). */
async function notifyLeo(customerId: string, brandName: string): Promise<void> {
  const leoId = await userIdByEmail(LEO_EMAIL);
  if (!leoId) return;
  const exists = await prisma.task.findFirst({
    where: { customerId, ownerId: leoId, category: "FOLLOWUP", title: { startsWith: "客户分配" } },
    select: { id: true },
  });
  if (!exists) {
    const count = await prisma.task.count({ where: { status: "TODO" } });
    await prisma.task.create({
      data: {
        title: `客户分配 · ${brandName}`,
        description: "新客户创建（信息收集表），请跟进处理客户分配事宜。",
        customerId,
        ownerId: leoId,
        publisherId: leoId,
        priority: "MID",
        category: "FOLLOWUP",
        status: "TODO",
        sortOrder: count,
      },
    });
  }
  await prisma.reminder.create({
    data: {
      title: `新客户分配：${brandName}`,
      content: `客户「${brandName}」已通过信息收集表创建，请处理客户分配。`,
      remindDate: new Date(),
      type: "FOLLOWUP",
      targetId: leoId,
      createdById: leoId,
    },
  });
}

// Public endpoint — no session required (allowed by middleware).
// Accepts the 4-section intake form. If `customerId` is provided the existing
// customer record is updated; otherwise a new INTAKE-sourced customer is created.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const get = (k: string) => String(body[k] ?? "").trim();
  const getArr = (k: string): string[] => {
    const v = body[k];
    return Array.isArray(v) ? v.map(String) : [];
  };
  const getObj = (k: string): Record<string, unknown> => {
    const v = body[k];
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  };

  const brandName = capitalizeBrandName(get("brandName"));
  if (!brandName) {
    return NextResponse.json(
      { error: "请填写品牌/店铺名称" },
      { status: 400 },
    );
  }

  // Resolve channel user — validate the ID actually exists
  const channelIdRaw = get("channelId");
  let channelUserId: string | null = null;
  if (channelIdRaw) {
    const channelUser = await prisma.user.findUnique({
      where: { id: channelIdRaw, role: "CHANNEL" },
      select: { id: true },
    });
    channelUserId = channelUser?.id ?? null;
  }

  // Resolve staff sharer — used as createdById + default businessOwnerId
  const staffIdRaw = get("staffId");
  let sharerStaffId: string | null = null;
  if (staffIdRaw) {
    const staffUser = await prisma.user.findFirst({
      where: { id: staffIdRaw, role: { in: ["ADMIN", "USER"] } },
      select: { id: true },
    });
    sharerStaffId = staffUser?.id ?? null;
  }

  const mainSites = getArr("mainSites").filter((s) => MAIN_SITES.includes(s));
  const targetPlatforms = getArr("targetPlatforms").filter((p) =>
    PROMO_PLATFORMS.includes(p),
  );
  const promotionGoals = getArr("promotionGoals").filter((g) =>
    PROMOTION_GOALS.includes(g),
  );

  const data = {
    brandName,
    mainSites: JSON.stringify(mainSites),
    siteLinks: JSON.stringify(getObj("siteLinks")),
    competitor: get("competitor") || null,
    targetPlatforms: JSON.stringify(targetPlatforms),
    platformGmv: JSON.stringify(getObj("platformGmv")),
    amazonAcos: get("amazonAcos") || null,
    amazonAcosNote: get("amazonAcosNote") || null,
    socialMediaInfo: get("socialMediaInfo") || null,
    affiliateHistory: get("affiliateHistory") || null,
    affiliatePlatforms: get("affiliatePlatforms") || null,
    promotionGoals: JSON.stringify(promotionGoals),
    targetGmv: get("targetGmv") || null,
    channelBudget: get("channelBudget") || null,
    affiliateTeam: get("affiliateTeam") || null,
    contactName: get("contactName") || null,
    contactEmail: get("contactEmail") || null,
    contactPhone: get("contactPhone") || null,
  };

  // Sharer attribution:
  //  - createdById = whoever shared the link (staff first; channel as fallback; null for anonymous)
  //  - businessOwnerId = staff sharer; else ledo.h@thraiveagency.com fallback (only when creating new)
  const createdById = sharerStaffId ?? channelUserId ?? null;
  const ledoId = await userIdByEmail(LEDO_EMAIL);
  const defaultBusinessOwnerId = sharerStaffId ?? ledoId ?? null;

  const customerId = get("customerId");
  if (customerId) {
    const existing = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (existing) {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          ...data,
          // Only set channelUserId if not already assigned
          ...(channelUserId && !existing.channelUserId ? { channelUserId } : {}),
          // Only set businessOwnerId if not already assigned and a sharer is known
          ...(!existing.businessOwnerId && defaultBusinessOwnerId
            ? { businessOwnerId: defaultBusinessOwnerId }
            : {}),
        },
      });
      return NextResponse.json({ ok: true });
    }
  }

  // Fallback: match by brand name, else create fresh.
  const byName = await prisma.customer.findFirst({ where: { brandName } });
  if (byName) {
    await prisma.customer.update({
      where: { id: byName.id },
      data: {
        ...data,
        ...(channelUserId && !byName.channelUserId ? { channelUserId } : {}),
        ...(!byName.businessOwnerId && defaultBusinessOwnerId
          ? { businessOwnerId: defaultBusinessOwnerId }
          : {}),
      },
    });
    await notifyLeo(byName.id, byName.brandName);
  } else {
    const created = await prisma.customer.create({
      data: {
        ...data,
        source: "INTAKE",
        status: "UNASSIGNED",
        ...(channelUserId ? { channelUserId } : {}),
        ...(defaultBusinessOwnerId ? { businessOwnerId: defaultBusinessOwnerId } : {}),
        ...(createdById ? { createdById } : {}),
      },
    });
    await notifyLeo(created.id, created.brandName);
  }

  return NextResponse.json({ ok: true });
}
