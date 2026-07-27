import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";

export async function GET(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermissionLevel(await resolveUserPermission(auth.userId, "affiliates.reviews"), "READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const affiliateName = sp.get("affiliateName")?.trim() ?? "";
  const customerId    = sp.get("customerId")?.trim() ?? "";
  const reviewerId    = sp.get("reviewerId")?.trim() ?? "";
  const dateFrom      = sp.get("dateFrom")?.trim() ?? "";
  const dateTo        = sp.get("dateTo")?.trim() ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (affiliateName) {
    where.affiliate = { platformAffiliateName: { contains: affiliateName } };
  }
  if (customerId) where.customerId = customerId;
  if (reviewerId) where.reviewerId = reviewerId;
  if (dateFrom || dateTo) {
    const df: Record<string, Date> = {};
    if (dateFrom) df.gte = new Date(dateFrom);
    if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); df.lte = d; }
    where.createdAt = df;
  }

  const reviews = await prisma.affiliateCoopReview.findMany({
    where,
    include: {
      affiliate: { select: { id: true, platformAffiliateName: true, personInChargeId: true,
        personInCharge: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(reviews);
}
