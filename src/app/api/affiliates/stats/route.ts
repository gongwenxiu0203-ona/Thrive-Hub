import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const multi = (key: string) =>
    (sp.get(key) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const sources      = multi("sources");
  const categories   = multi("categories");
  const types        = multi("types");
  const tags         = multi("tags");
  const brands       = multi("brands");
  const statuses     = multi("statuses");
  const modes        = multi("modes");
  const owners       = multi("owners");
  const topCreators  = multi("topCreators");
  const sampleShips  = multi("sampleShipping");
  const q            = sp.get("q")?.trim() ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (q) where.OR = [
    { platformAffiliateName: { contains: q } },
    { internalAffiliateName: { contains: q } },
  ];
  if (sources.length)     where.source           = { in: sources };
  if (categories.length)  where.category         = { in: categories };
  if (types.length)       where.affiliateType    = { in: types };
  if (brands.length)      where.brand            = { in: brands };
  if (statuses.length)    where.developmentStatus = { in: statuses };
  if (owners.length)      where.personInChargeId = { in: owners };
  if (topCreators.length) where.topCreator       = { in: topCreators };
  if (sampleShips.length) where.sampleShipping   = { in: sampleShips };

  if (tags.length) {
    where.AND = [
      ...(where.AND ?? []),
      ...tags.map((t: string) => ({ tags: { contains: t } })),
    ];
  }
  if (modes.length) {
    where.AND = [
      ...(where.AND ?? []),
      ...modes.map((m: string) => ({ cooperationMode: { contains: m } })),
    ];
  }

  const affiliates = await prisma.affiliate.findMany({
    where,
    select: {
      source: true,
      category: true,
      affiliateType: true,
      tags: true,
      brand: true,
      developmentStatus: true,
      cooperationMode: true,
      topCreator: true,
      sampleShipping: true,
      insFollowers: true,
      youtubeFollowers: true,
      tiktokFollowers: true,
      fbFollowers: true,
      websiteTraffic: true,
      storefrontFlatfee: true,
      ltkFlatfee: true,
      pinterestFlatfee: true,
      websitePlacements: true,
      instagramPlacements: true,
      facebookPlacements: true,
      youtubePlacements: true,
      tiktokPlacements: true,
      personInCharge: { select: { id: true, name: true } },
      createdAt: true,
    },
  });

  // Helpers
  const countBy = (fn: (a: (typeof affiliates)[0]) => string | null | undefined) => {
    const map: Record<string, number> = {};
    for (const a of affiliates) {
      const v = fn(a) ?? "未填写";
      map[v] = (map[v] ?? 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  };

  const flatJsonCount = (getter: (a: (typeof affiliates)[0]) => string | null | undefined) => {
    const map: Record<string, number> = {};
    for (const a of affiliates) {
      const s = getter(a);
      if (!s) continue;
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) {
          arr.forEach((v: string) => { if (v) map[v] = (map[v] ?? 0) + 1; });
        }
      } catch { /* ignore */ }
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  };

  // Monthly new (last 6 months)
  const now = new Date();
  const monthlyNew = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month: label, count: affiliates.filter((a) => a.createdAt >= d && a.createdAt < next).length };
  });

  // Placements flatfee totals per platform
  const parsePlacements = (json: string) => {
    try { const a = JSON.parse(json); return Array.isArray(a) ? a : []; } catch { return []; }
  };
  const sumPlacementFlatfees = (getter: (a: (typeof affiliates)[0]) => string) =>
    affiliates.reduce((s, a) => {
      const pls = parsePlacements(getter(a));
      return s + pls.reduce((ps: number, p: { flatfee?: number | null }) => ps + (p.flatfee ?? 0), 0);
    }, 0);

  // Owner distribution
  const byOwner = countBy((a) => a.personInCharge?.name ?? "未分配");

  return NextResponse.json({
    total: affiliates.length,
    bySource:         countBy((a) => a.source),
    byCategory:       countBy((a) => a.category),
    byType:           countBy((a) => a.affiliateType),
    byBrand:          countBy((a) => a.brand),
    byStatus:         countBy((a) => a.developmentStatus),
    byTag:            flatJsonCount((a) => a.tags),
    byMode:           flatJsonCount((a) => a.cooperationMode),
    byTopCreator:     countBy((a) => a.topCreator),
    bySampleShipping: countBy((a) => a.sampleShipping),
    byOwner,
    totalFollowers: {
      Instagram: affiliates.reduce((s, a) => s + (a.insFollowers ?? 0), 0),
      YouTube:   affiliates.reduce((s, a) => s + (a.youtubeFollowers ?? 0), 0),
      TikTok:    affiliates.reduce((s, a) => s + (a.tiktokFollowers ?? 0), 0),
      Facebook:  affiliates.reduce((s, a) => s + (a.fbFollowers ?? 0), 0),
      Website:   affiliates.reduce((s, a) => s + (a.websiteTraffic ?? 0), 0),
    },
    placementFlatfees: {
      Website:   sumPlacementFlatfees((a) => a.websitePlacements),
      Instagram: sumPlacementFlatfees((a) => a.instagramPlacements),
      Facebook:  sumPlacementFlatfees((a) => a.facebookPlacements),
      YouTube:   sumPlacementFlatfees((a) => a.youtubePlacements),
      TikTok:    sumPlacementFlatfees((a) => a.tiktokPlacements),
      Storefront: affiliates.reduce((s, a) => s + (a.storefrontFlatfee ?? 0), 0),
      LTK:       affiliates.reduce((s, a) => s + (a.ltkFlatfee ?? 0), 0),
      Pinterest: affiliates.reduce((s, a) => s + (a.pinterestFlatfee ?? 0), 0),
    },
    monthlyNew,
  });
}
