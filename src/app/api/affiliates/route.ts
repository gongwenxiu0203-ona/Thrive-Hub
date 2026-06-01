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
  const names = multi("names");        // 联盟商名称 (platformAffiliateName)
  const pics = multi("pics");          // 负责人 (matches User.name OR personInChargeName text)
  // Sales-linked filters (brand / affiliateType from SalesRecord)
  const salesBrands = multi("salesBrands");
  const salesTypes = multi("salesTypes");

  // Build base where
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (q) {
    where.OR = [
      { platformAffiliateName: { contains: q } },
      { internalAffiliateName: { contains: q } },
    ];
  }
  if (sources.length) where.source = { in: sources };
  if (categories.length) where.category = { in: categories };
  if (types.length) where.affiliateType = { in: types };
  if (brands.length) where.brand = { in: brands };
  if (statuses.length) where.developmentStatus = { in: statuses };
  if (owners.length) where.personInChargeId = { in: owners };
  if (names.length) where.platformAffiliateName = { in: names };
  if (regions.length) where.region = { in: regions };

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
    const srWhere: any = {};
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
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
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
      affiliateType: body.affiliateType ?? null,
      tags: serialise(body.tags),
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
      personInChargeId: body.personInChargeId ?? null,
    },
  });

  return NextResponse.json(affiliate, { status: 201 });
}
