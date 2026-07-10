import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(10, parseInt(sp.get("pageSize") ?? "50", 10)));
  const q = sp.get("q")?.trim() ?? "";

  // Multi-value filter params (comma-separated)
  const multi = (key: string) =>
    (sp.get(key) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const sources = multi("sources");
  const categories = multi("categories");
  const types = multi("types");
  const tags = multi("tags");
  const brands = multi("brands");      // Affiliate.brand field
  const statuses = multi("statuses");
  const modes = multi("modes");
  const owners = multi("owners");
  const regions = multi("regions");
  const dateFrom = sp.get("dateFrom")?.trim();
  const dateTo = sp.get("dateTo")?.trim();
  const sort = sp.get("sort")?.trim() ?? "createdAt";
  const dir = sp.get("dir") === "asc" ? "asc" : "desc";
  const names = multi("names");        // 联盟商名称 (platformAffiliateName)
  const pics = multi("pics");          // 负责人 (matches User.name OR personInChargeName text)
  // Sales-linked filters (brand / affiliateType from SalesRecord)
  const salesBrands = multi("salesBrands");
  const salesTypes = multi("salesTypes");

  // Build base where（排除回收站中的软删除联盟商）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { deletedAt: null };

  if (q) {
    where.OR = [
      { platformAffiliateName: { contains: q } },
      { internalAffiliateName: { contains: q } },
    ];
  }
  if (sources.length) where.source = { in: sources };
  if (categories.length) where.category = { in: categories };
  if (types.length) {
    const normalTypes = types.filter((type) => type !== "待定");
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          ...(normalTypes.length ? [{ affiliateType: { in: normalTypes } }] : []),
          ...(types.includes("待定") ? [{ affiliateType: "待定" }, { affiliateType: null }, { affiliateType: "" }] : []),
        ],
      },
    ];
  }
  if (brands.length) where.brand = { in: brands };
  if (statuses.length) where.developmentStatus = { in: statuses };
  if (owners.length) where.personInChargeId = { in: owners };
  if (names.length) where.platformAffiliateName = { in: names };
  if (regions.length) where.region = { in: regions };
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }
    where.createdAt = dateFilter;
  }

  // pic filter spans User-linked name and uploaded text — wrap in AND so it
  // composes with any pre-existing where.OR (e.g., from the q search).
  if (pics.length) {
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          { personInCharge: { name: { in: pics } } },
          { personInChargeName: { in: pics } },
        ],
      },
    ];
  }

  // tags is stored as JSON string — use contains per tag
  if (tags.length) {
    where.AND = [
      ...(where.AND ?? []),
      ...tags.map((t: string) => ({ tags: { contains: t } })),
    ];
  }
  // cooperationMode is stored as JSON string
  if (modes.length) {
    const modeFilters = modes.map((m: string) => ({ cooperationMode: { contains: m } }));
    where.AND = [...(where.AND ?? []), ...modeFilters];
  }

  // If salesBrand/salesType filter → first find matching affiliateNames from SalesRecord
  let nameFilter: string[] | undefined;
  if (salesBrands.length || salesTypes.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const srWhere: any = { deletedAt: null };
    if (salesBrands.length) srWhere.brand = { in: salesBrands };
    if (salesTypes.length) srWhere.affiliateType = { in: salesTypes };
    const matches = await prisma.salesRecord.findMany({
      where: srWhere,
      select: { affiliateName: true },
      distinct: ["affiliateName"],
    });
    nameFilter = matches.map((r) => r.affiliateName);
    if (nameFilter.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, pageSize });
    }
    // Intersect with any name filter already applied
    if (names.length) {
      const intersect = nameFilter.filter((n) => names.includes(n));
      if (intersect.length === 0) {
        return NextResponse.json({ data: [], total: 0, page, pageSize });
      }
      where.platformAffiliateName = { in: intersect };
    } else {
      where.platformAffiliateName = { in: nameFilter };
    }
  }

  const [total, data] = await Promise.all([
    prisma.affiliate.count({ where }),
    prisma.affiliate.findMany({
      where,
      include: { personInCharge: { select: { id: true, name: true } } },
      orderBy: sort === "createdAt" ? { createdAt: dir } : { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // 过往销售：按平台联盟商名称聚合本页联盟商的销售记录（销售额 + 单量）
  const pageNames = data.map((a) => a.platformAffiliateName).filter(Boolean);
  const salesByName = new Map<string, { revenue: number; units: number }>();
  if (pageNames.length) {
    const grouped = await prisma.salesRecord.groupBy({
      by: ["affiliateName"],
      where: { affiliateName: { in: pageNames }, deletedAt: null },
      _sum: { revenue: true, unitsSold: true },
    });
    for (const g of grouped) {
      salesByName.set(g.affiliateName, {
        revenue: g._sum.revenue ?? 0,
        units: g._sum.unitsSold ?? 0,
      });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = data.map((a: any) => ({
    ...a,
    salesRevenue: salesByName.get(a.platformAffiliateName)?.revenue ?? 0,
    salesUnits: salesByName.get(a.platformAffiliateName)?.units ?? 0,
  }));

  return NextResponse.json({ data: enriched, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Ensure array-stored fields are serialised
  const serialise = (v: unknown) =>
    typeof v === "string" ? v : JSON.stringify(v ?? []);

  const affiliate = await prisma.affiliate.create({
    data: {
      platformAffiliateName: body.platformAffiliateName,
      internalAffiliateName: body.internalAffiliateName ?? null,
      source: body.source ?? null,
      category: body.category ?? null,
      affiliateType: body.affiliateType || "待定",
      tags: serialise(body.tags),
      promotionPlacements: serialise(body.promotionPlacements),
      websiteLink: body.websiteLink ?? null,
      websiteTraffic: body.websiteTraffic ? Number(body.websiteTraffic) : null,
      websitePlacements: serialise(body.websitePlacements),
      websiteNote: body.websiteNote ?? null,
      instagramLink: body.instagramLink ?? null,
      insFollowers: body.insFollowers ? Number(body.insFollowers) : null,
      instagramPlacements: serialise(body.instagramPlacements),
      insNote: body.insNote ?? null,
      facebookLink: body.facebookLink ?? null,
      fbFollowers: body.fbFollowers ? Number(body.fbFollowers) : null,
      facebookPlacements: serialise(body.facebookPlacements),
      fbNote: body.fbNote ?? null,
      youtubeLink: body.youtubeLink ?? null,
      youtubeFollowers: body.youtubeFollowers ? Number(body.youtubeFollowers) : null,
      youtubePlacements: serialise(body.youtubePlacements),
      tiktokLink: body.tiktokLink ?? null,
      tiktokFollowers: body.tiktokFollowers ? Number(body.tiktokFollowers) : null,
      tiktokPlacements: serialise(body.tiktokPlacements),
      amazonStorefrontLink: body.amazonStorefrontLink ?? null,
      topCreator: body.topCreator ?? null,
      storefrontFlatfee: body.storefrontFlatfee ? Number(body.storefrontFlatfee) : null,
      storefrontNote: body.storefrontNote ?? null,
      ltkLink: body.ltkLink ?? null,
      ltkFlatfee: body.ltkFlatfee ? Number(body.ltkFlatfee) : null,
      pinterestLink: body.pinterestLink ?? null,
      pinterestFlatfee: body.pinterestFlatfee ? Number(body.pinterestFlatfee) : null,
      flatfeeSupplementary: body.flatfeeSupplementary ?? null,
      note: body.note ?? null,
      contactInfo: body.contactInfo ?? null,
      brand: body.brand ?? null,
      developmentStatus: body.developmentStatus ?? null,
      developmentDesc: body.developmentDesc ?? null,
      contactEmail: body.contactEmail ?? null,
      personInChargeId: body.personInChargeId ?? null,
      cooperationMode: serialise(body.cooperationMode),
      sampleShipping: body.sampleShipping ?? null,
      brandEntries: serialise(body.brandEntries),
      promoContents: serialise(body.promoContents),
      mediaKitItems: serialise(body.mediaKitItems),
    },
  });

  return NextResponse.json(affiliate, { status: 201 });
}
