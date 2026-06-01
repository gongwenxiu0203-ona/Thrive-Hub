import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// PATCH /api/finance/channel-reconciliations/[id]/periods/[periodId]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; periodId: string }> },
) {
  try {
    await requireSession();
    const { periodId } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if ("fixedFeeAmount" in body) data.fixedFeeAmount = body.fixedFeeAmount != null ? Number(body.fixedFeeAmount) : null;
    if ("commissionAmount" in body) data.commissionAmount = body.commissionAmount != null ? Number(body.commissionAmount) : null;
    if ("fixedFeePaidAt" in body) data.fixedFeePaidAt = body.fixedFeePaidAt ? new Date(body.fixedFeePaidAt) : null;
    if ("commissionPaidAt" in body) data.commissionPaidAt = body.commissionPaidAt ? new Date(body.commissionPaidAt) : null;
    if ("proofUrl" in body) data.proofUrl = body.proofUrl || null;
    if ("notes" in body) data.notes = body.notes || null;
    if ("periodLabel" in body) data.periodLabel = body.periodLabel || null;

    const updated = await prisma.channelReconciliationPeriod.update({
      where: { id: periodId },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}
