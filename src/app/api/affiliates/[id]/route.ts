import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { salesScope } from "@/lib/dataScope";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const affiliatePermission = await resolveUserPermission(auth.userId, "affiliates");
  if (!hasPermissionLevel(affiliatePermission, "READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const affiliate = await prisma.affiliate.findFirst({
    where: { id, deletedAt: null },
    include: {
      personInCharge: { select: { id: true, name: true, email: true } },
      coopReviews: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!affiliate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Linked sub-accounts (same internalAffiliateName)
  let linkedAccounts: { id: string; platformAffiliateName: string }[] = [];
  if (affiliate.internalAffiliateName) {
    linkedAccounts = await prisma.affiliate.findMany({
      where: {
        internalAffiliateName: affiliate.internalAffiliateName,
        id: { not: id },
        deletedAt: null,
      },
      select: { id: true, platformAffiliateName: true },
    });
  }

  // Linked sales data
  const salesRecords = await prisma.salesRecord.findMany({
    where: { affiliateName: affiliate.platformAffiliateName, deletedAt: null, ...salesScope(auth, "all") },
    orderBy: { orderDate: "desc" },
    take: 500,
  });

  return NextResponse.json({ affiliate, linkedAccounts, salesRecords });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const affiliatePermission = await resolveUserPermission(auth.userId, "affiliates");
  if (!hasPermissionLevel(affiliatePermission, "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const serialise = (v: unknown) =>
    typeof v === "string" ? v : JSON.stringify(v ?? []);

  // Build update payload — only include keys present in body
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  const simple = [
    "platformAffiliateName","internalAffiliateName","source","category","affiliateType",
    "websiteLink","websiteTraffic","websiteNote",
    "instagramLink","insFollowers","insNote",
    "facebookLink","fbFollowers","fbNote",
    "youtubeLink","youtubeFollowers",
    "tiktokLink","tiktokFollowers",
    "amazonStorefrontLink","topCreator","storefrontFlatfee","storefrontNote",
    "ltkLink","ltkFlatfee","pinterestLink","pinterestFlatfee",
    "flatfeeSupplementary","note","contactInfo","brand",
    "developmentStatus","developmentDesc","contactEmail","personInChargeId",
    "sampleShipping","customerCooperations",
  ];
  const jsonFields = ["tags","promotionPlacements","websitePlacements","instagramPlacements","facebookPlacements","youtubePlacements","tiktokPlacements","cooperationMode","brandEntries","promoContents","mediaKitItems"];
  const numericFields = ["websiteTraffic","insFollowers","fbFollowers","youtubeFollowers","tiktokFollowers","storefrontFlatfee","ltkFlatfee","pinterestFlatfee"];

  for (const k of simple) {
    if (k in body) {
      data[k] = numericFields.includes(k) && body[k] !== null && body[k] !== undefined
        ? Number(body[k])
        : body[k] ?? null;
    }
  }
  for (const k of jsonFields) {
    if (k in body) data[k] = serialise(body[k]);
  }

  const updated = await prisma.affiliate.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const affiliatePermission = await resolveUserPermission(auth.userId, "affiliates");
  if (!hasPermissionLevel(affiliatePermission, "MANAGE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  // 软删除：进回收站，7 天内可恢复
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.affiliate.update as any)({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
