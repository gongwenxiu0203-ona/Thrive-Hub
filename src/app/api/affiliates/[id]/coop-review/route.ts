import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermissionLevel(await resolveUserPermission(auth.userId, "affiliates"), "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const {
    customerId, customerName, platform, fee, blurBrands, notes,
    customerStatus,
    // Structured data for reconciliation auto-creation
    platforms,  // [{platform, link, decision, placements:[{name,currency,flatfee}]}]
    coopModes,  // string[]
  } = body;

  const activeAffiliate = await prisma.affiliate.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!activeAffiliate) {
    return NextResponse.json({ error: "联盟商不存在或已删除" }, { status: 404 });
  }
  if (customerId) {
    const activeCustomer = await prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true },
    });
    if (!activeCustomer) {
      return NextResponse.json({ error: "客户不存在或已删除" }, { status: 400 });
    }
  }

  // Create review record
  const review = await prisma.affiliateCoopReview.create({
    data: {
      affiliateId: id,
      customerId: customerId ?? null,
      customerName: customerName ?? null,
      platform: platform ?? null,
      fee: fee ? Number(fee) : null,
      blurBrands: !!blurBrands,
      notes: notes ?? null,
      reviewerId: auth.userId,
      reviewerName: auth.name ?? null,
      customerStatus: customerStatus ?? null,
    },
  });

  // Write back customerCooperations on the affiliate
  if (customerId && customerStatus) {
    const aff = await prisma.affiliate.findUnique({
      where: { id },
      select: { customerCooperations: true },
    });
    let coops: { customerId: string; customerName?: string; status: string }[] = [];
    try {
      coops = JSON.parse(aff?.customerCooperations ?? "[]");
    } catch {
      coops = [];
    }
    const idx = coops.findIndex((c) => c.customerId === customerId);
    const entry = { customerId, customerName: customerName ?? "", status: customerStatus };
    if (idx >= 0) coops[idx] = entry;
    else coops.push(entry);

    await prisma.affiliate.update({
      where: { id },
      data: { customerCooperations: JSON.stringify(coops) },
    });
  }

  // Auto-create AffiliateReconciliation for each approved platform
  const approvedPlatforms = Array.isArray(platforms)
    ? platforms.filter((p: { decision: string }) => p.decision === "通过")
    : [];

  if (approvedPlatforms.length > 0) {
    const affiliate = await prisma.affiliate.findUnique({
      where: { id },
      select: { platformAffiliateName: true },
    });

    const platformsJson = JSON.stringify(
      approvedPlatforms.map((p: { platform: string; link: string; placements: { name: string; currency: string; flatfee: string }[] }) => ({
        platform: p.platform,
        link: p.link ?? "",
        placements: p.placements ?? [],
      }))
    );

    await prisma.affiliateReconciliation.create({
      data: {
        affiliateId: id,
        affiliateName: affiliate?.platformAffiliateName ?? id,
        customerId: customerId ?? null,
        customerName: customerName ?? null,
        cooperationMode: JSON.stringify(Array.isArray(coopModes) ? coopModes : []),
        platforms: platformsJson,
        coopReviewId: review.id,
        submitterId: auth.userId,
        status: "pending",
      },
    });

    // Notify the submitter to fill in payment info
    await prisma.reminder.create({
      data: {
        title: `【联盟商对账】${affiliate?.platformAffiliateName ?? id} 合作审核通过，请填写付款信息`,
        content: `${approvedPlatforms.map((p: { platform: string }) => p.platform).join("、")} 平台审核通过${customerName ? `（客户：${customerName}）` : ""}，请前往财务对账 → 联盟商对账填写付款账户信息。`,
        remindDate: new Date(),
        type: "FOLLOWUP",
        targetId: auth.userId,
        createdById: auth.userId,
      },
    });
  }

  return NextResponse.json(review, { status: 201 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermissionLevel(await resolveUserPermission(auth.userId, "affiliates"), "READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const reviews = await prisma.affiliateCoopReview.findMany({
    where: { affiliateId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(reviews);
}
