import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { ChannelReconciliationDetail } from "./ChannelReconciliationDetail";

export const dynamic = "force-dynamic";
export const metadata = { title: "渠道商分账详情 · Thraive联盟营销系统" };

export default async function ChannelReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  if (!isStaff(session.role) && session.role !== "CHANNEL") redirect("/finance");
  const { id } = await params;

  const rec = await prisma.channelReconciliation.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, brandName: true } },
      contract: { select: { id: true, contractNo: true } },
      channelUser: { select: { id: true, name: true } },
      splitRule: true,
      periods: { orderBy: { periodIndex: "asc" } },
    },
  });
  if (!rec) notFound();
  if (session.role === "CHANNEL" && rec.channelUserId !== session.userId) notFound();

  // Customer reconciliation history (used for timeline + amount sourcing)
  const customerRecs = await prisma.customerReconciliation.findMany({
    where: { customerId: rec.customerId, deletedAt: null },
    orderBy: { periodStart: "desc" },
    take: 24,
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      feeAmount: true,
      commissionAmount: true,
      createdAt: true,
      submittedAt: true,
    },
  });

  return (
    <ChannelReconciliationDetail
      isAdmin={session.role === "ADMIN"}
      isStaff={isStaff(session.role)}
      record={{
        id: rec.id,
        autoCreated: rec.autoCreated,
        totalPeriods: rec.totalPeriods,
        periodType: rec.periodType,
        fixedFeeTotal: rec.fixedFeeTotal,
        commissionTotal: rec.commissionTotal,
        fixedFeeShareRate: rec.fixedFeeShareRate,
        commissionShareRate: rec.commissionShareRate,
        customer: rec.customer ?? { id: rec.customerId, brandName: "—" },
        contract: rec.contract,
        channelUser: rec.channelUser,
        periodNo: rec.periodNo,
        periodStart: rec.periodStart?.toISOString() ?? null,
        periodEnd: rec.periodEnd?.toISOString() ?? null,
        fixedFeeReceived: rec.fixedFeeReceived,
        fixedFeeShareAmount: rec.fixedFeeShareAmount,
        fixedFeeShareCurrency: rec.fixedFeeShareCurrency,
        fixedFeeEstimatedDate: rec.fixedFeeEstimatedDate?.toISOString() ?? null,
        fixedFeeActualDate: rec.fixedFeeActualDate?.toISOString() ?? null,
        fixedFeeProofUrl: rec.fixedFeeProofUrl,
        fixedFeePushedToChannel: rec.fixedFeePushedToChannel,
        commissionReceived: rec.commissionReceived,
        commissionShareAmount: rec.commissionShareAmount,
        commissionShareCurrency: rec.commissionShareCurrency,
        commissionEstimatedDate: rec.commissionEstimatedDate?.toISOString() ?? null,
        commissionActualDate: rec.commissionActualDate?.toISOString() ?? null,
        commissionProofUrl: rec.commissionProofUrl,
        commissionPushedToChannel: rec.commissionPushedToChannel,
        splitRule: rec.splitRule ? {
          id: rec.splitRule.id,
          ruleType: rec.splitRule.ruleType,
          splitEndDate: rec.splitRule.splitEndDate.toISOString(),
          fixedFeeRate: rec.splitRule.fixedFeeRate,
          commissionRate: rec.splitRule.commissionRate,
          tieredRules: rec.splitRule.tieredRules,
        } : null,
        periods: rec.periods.map((p) => ({
          id: p.id,
          periodIndex: p.periodIndex,
          periodLabel: p.periodLabel,
          fixedFeeAmount: p.fixedFeeAmount,
          commissionAmount: p.commissionAmount,
          fixedFeePaidAt: p.fixedFeePaidAt?.toISOString() ?? null,
          commissionPaidAt: p.commissionPaidAt?.toISOString() ?? null,
          proofUrl: p.proofUrl,
          notes: p.notes,
        })),
      }}
      customerRecs={customerRecs.map((c) => ({
        id: c.id,
        periodLabel: `${c.periodStart.toISOString().slice(0, 7)}`,
        status: c.status,
        feeAmount: c.feeAmount,
        commissionAmount: c.commissionAmount,
        createdAt: c.createdAt.toISOString(),
        submittedAt: c.submittedAt?.toISOString() ?? null,
      }))}
    />
  );
}
