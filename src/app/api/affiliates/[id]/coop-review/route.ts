import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { customerId, customerName, platform, fee, blurBrands, notes, customerStatus } = body;

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

  return NextResponse.json(review, { status: 201 });
}
