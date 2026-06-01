import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// PATCH /api/finance/channel-reconciliations/[id] — 编辑分账记录
// v2: 支持固费/抽佣两侧的金额、比例、日期、截图、推送状态更新
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.channelReconciliation.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = { updatedAt: new Date() };

    // 新版分账管理配置字段
    if ("totalPeriods" in body) data.totalPeriods = body.totalPeriods ? Number(body.totalPeriods) : null;
    if ("periodType" in body) data.periodType = body.periodType || null;
    if ("fixedFeeTotal" in body) data.fixedFeeTotal = body.fixedFeeTotal != null ? Number(body.fixedFeeTotal) : null;
    if ("commissionTotal" in body) data.commissionTotal = body.commissionTotal != null ? Number(body.commissionTotal) : null;
    if ("fixedFeeShareRate" in body && !("fixedFeeReceived" in body)) {
      data.fixedFeeShareRate = Number(body.fixedFeeShareRate);
    }
    if ("commissionShareRate" in body && !("commissionReceived" in body)) {
      data.commissionShareRate = Number(body.commissionShareRate);
    }

    // 通用字段
    if ("note" in body) data.note = body.note;
    if ("periodNo" in body) data.periodNo = body.periodNo;
    if ("periodStart" in body)
      data.periodStart = body.periodStart ? new Date(body.periodStart) : null;
    if ("periodEnd" in body)
      data.periodEnd = body.periodEnd ? new Date(body.periodEnd) : null;

    // 固费分账
    const fixedFields = [
      "fixedFeeReceived",
      "fixedFeeShareRate",
      "fixedFeeShareCurrency",
      "fixedFeeProofUrl",
      "fixedFeePushedToChannel",
    ];
    for (const k of fixedFields) {
      if (k in body) data[k] = body[k];
    }
    if ("fixedFeeEstimatedDate" in body) {
      data.fixedFeeEstimatedDate = body.fixedFeeEstimatedDate
        ? new Date(body.fixedFeeEstimatedDate)
        : null;
    }
    if ("fixedFeeActualDate" in body) {
      data.fixedFeeActualDate = body.fixedFeeActualDate
        ? new Date(body.fixedFeeActualDate)
        : null;
    }

    // 抽佣分账
    const commFields = [
      "commissionReceived",
      "commissionShareRate",
      "commissionShareCurrency",
      "commissionProofUrl",
      "commissionPushedToChannel",
    ];
    for (const k of commFields) {
      if (k in body) data[k] = body[k];
    }
    if ("commissionEstimatedDate" in body) {
      data.commissionEstimatedDate = body.commissionEstimatedDate
        ? new Date(body.commissionEstimatedDate)
        : null;
    }
    if ("commissionActualDate" in body) {
      data.commissionActualDate = body.commissionActualDate
        ? new Date(body.commissionActualDate)
        : null;
    }

    // 自动重算 shareAmount = received × rate
    const finalReceived =
      "fixedFeeReceived" in body
        ? body.fixedFeeReceived
        : existing.fixedFeeReceived;
    const finalRate =
      "fixedFeeShareRate" in body
        ? body.fixedFeeShareRate
        : existing.fixedFeeShareRate;
    if (finalReceived != null && finalRate != null) {
      data.fixedFeeShareAmount = (finalReceived ?? 0) * (finalRate ?? 0);
    }

    const commFinalReceived =
      "commissionReceived" in body
        ? body.commissionReceived
        : existing.commissionReceived;
    const commFinalRate =
      "commissionShareRate" in body
        ? body.commissionShareRate
        : existing.commissionShareRate;
    if (commFinalReceived != null && commFinalRate != null) {
      data.commissionShareAmount =
        (commFinalReceived ?? 0) * (commFinalRate ?? 0);
    }

    const updated = await prisma.channelReconciliation.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

// DELETE /api/finance/channel-reconciliations/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    await prisma.channelReconciliation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
