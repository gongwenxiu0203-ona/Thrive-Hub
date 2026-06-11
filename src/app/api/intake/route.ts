import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAIN_SITES, PROMO_PLATFORMS, PROMOTION_GOALS } from "@/lib/constants";

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

  const brandName = get("brandName");
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
      },
    });
  } else {
    await prisma.customer.create({
      data: {
        ...data,
        source: "INTAKE",
        status: "UNASSIGNED",
        ...(channelUserId ? { channelUserId } : {}),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
