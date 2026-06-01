import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const record = await prisma.affiliateReconciliation.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const {
    promotionAsin, paymentMethod, paymentAccountName, paymentAccount,
    paymentNote, paymentCurrency, paymentAmount, paymentRequestAt,
    paidAt, transactionNo, proofUrl,
  } = body;

  // Determine new status
  let status = record.status;
  const hasPaidAt = paidAt !== undefined ? !!paidAt : !!record.paidAt;
  const hasPaymentRequest = paymentRequestAt !== undefined ? !!paymentRequestAt : !!record.paymentRequestAt;

  if (hasPaidAt) status = "paid";
  else if (hasPaymentRequest) status = "info_filled";

  const updated = await prisma.affiliateReconciliation.update({
    where: { id },
    data: {
      promotionAsin: promotionAsin ?? record.promotionAsin,
      paymentMethod: paymentMethod ?? record.paymentMethod,
      paymentAccountName: paymentAccountName ?? record.paymentAccountName,
      paymentAccount: paymentAccount ?? record.paymentAccount,
      paymentNote: paymentNote ?? record.paymentNote,
      paymentCurrency: paymentCurrency ?? record.paymentCurrency,
      paymentAmount: paymentAmount !== undefined ? (paymentAmount ? Number(paymentAmount) : null) : record.paymentAmount,
      paymentRequestAt: paymentRequestAt !== undefined ? (paymentRequestAt ? new Date(paymentRequestAt) : null) : record.paymentRequestAt,
      paidAt: paidAt !== undefined ? (paidAt ? new Date(paidAt) : null) : record.paidAt,
      transactionNo: transactionNo !== undefined ? (transactionNo || null) : record.transactionNo,
      proofUrl: proofUrl !== undefined ? (proofUrl || null) : record.proofUrl,
      status,
    },
  });

  // When paymentRequestAt is newly set and submitter exists, create 7-business-day reminder
  const newPaymentRequest = paymentRequestAt && !record.paymentRequestAt;
  if (newPaymentRequest && record.submitterId && !record.reminderSentAt) {
    const remindDate = addBusinessDays(new Date(paymentRequestAt), 7);
    await prisma.reminder.create({
      data: {
        title: `【联盟商对账付款催催】${record.affiliateName} 付款申请已超7个工作日，请上传付款截图`,
        content: `联盟商 ${record.affiliateName}${record.customerName ? `（客户：${record.customerName}）` : ""} 付款申请于 ${new Date(paymentRequestAt).toLocaleDateString("zh-CN")} 提交，请确认实际付款时间并上传付款截图。`,
        remindDate,
        type: "FOLLOWUP",
        targetId: record.submitterId,
        createdById: auth.userId,
      },
    });
    await prisma.affiliateReconciliation.update({
      where: { id },
      data: { reminderSentAt: new Date() },
    });
  }

  return NextResponse.json(updated);
}
