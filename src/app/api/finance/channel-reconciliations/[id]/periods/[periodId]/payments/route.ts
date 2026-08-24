import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { parseMoney, refreshChannelPeriodPaymentStatus } from "@/lib/financeWorkflow";
import { errorResponse } from "@/lib/appError";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; periodId: string }> }) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "EDIT");
    if (!['ADMIN', 'USER'].includes(session.role)) return NextResponse.json({ error: "仅内部财务人员可登记付款" }, { status: 403 });
    const { id, periodId } = await params;
    const body = await req.json();
    const streamType = body.streamType === "FIXED_FEE" || body.streamType === "COMMISSION" ? body.streamType : periodStreamFallback(body.streamType);
    const amount = parseMoney(body.amount, "付款金额");
    const paidAt = new Date(body.paidAt);
    if (Number.isNaN(paidAt.getTime())) return NextResponse.json({ error: "付款日期无效" }, { status: 400 });
    const period = await prisma.channelReconciliationPeriod.findFirst({ where: { id: periodId, reconciliationId: id }, include: { payments: { where: { status: "PAID", streamType } } } });
    if (!period) return NextResponse.json({ error: "渠道对账周期不存在" }, { status: 404 });
    if (period.financeReviewStatus !== "APPROVED") return NextResponse.json({ error: "渠道业务凭证审核通过后才能付款" }, { status: 409 });
    if (period.streamType !== "BOTH" && period.streamType !== streamType) return NextResponse.json({ error: "付款费用类型与渠道分账周期不一致" }, { status: 400 });
    const due = streamType === "FIXED_FEE" ? (period.fixedFeeShareAmount ?? 0) : (period.commissionShareAmount ?? 0);
    const paid = period.payments.reduce((sum, row) => sum + row.amount, 0);
    if (amount > due - paid + 0.005) return NextResponse.json({ error: "付款金额超过未付余额" }, { status: 400 });
    const currency = String(body.currency || (streamType === "FIXED_FEE" ? period.fixedFeeReceivedCurrency : period.commissionReceivedCurrency) || "USD").toUpperCase();
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.channelPayment.create({ data: { channelPeriodId: periodId, streamType, amount, currency, paidAt, transactionNo: typeof body.transactionNo === "string" ? body.transactionNo.trim() || null : null, proofUrls: JSON.stringify(Array.isArray(body.proofUrls) ? body.proofUrls : []), createdById: session.userId } });
      const fullyPaid = paid + amount + 0.005 >= due;
      if (fullyPaid) await tx.channelReconciliationPeriod.update({ where: { id: periodId }, data: streamType === "FIXED_FEE" ? { fixedFeePaidAt: paidAt } : { commissionPaidAt: paidAt } });
      await tx.financeAuditLog.create({ data: { entityType: "CHANNEL_PAYMENT", entityId: created.id, action: "CREATE", actorId: session.userId, toStatus: fullyPaid ? "PAID" : "PARTIALLY_PAID", metadata: JSON.stringify({ periodId, streamType, amount, due }) } });
      return created;
    });
    const summary = await refreshChannelPeriodPaymentStatus(periodId, session.userId);
    return NextResponse.json({ payment, summary }, { status: 201 });
  } catch (error) {
    if (error instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    if (error instanceof Error && /必须|不能|超过|无效/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return errorResponse(error, "finance.channel-payments.create");
  }
}

function periodStreamFallback(value: unknown): "FIXED_FEE" | "COMMISSION" {
  if (value == null || value === "") throw new Error("必须选择固定费或销售佣金付款");
  throw new Error("付款费用类型无效");
}
