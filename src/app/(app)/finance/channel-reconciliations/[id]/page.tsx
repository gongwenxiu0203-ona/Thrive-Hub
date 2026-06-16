import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { deriveChannelPeriod, parseTieredRules, type PeriodDerived } from "@/lib/channelSplit";
import { ensureChannelDueDateReminders } from "@/actions/channelSplit";
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

  // Pull all customer reconciliations (confirmed and not) for the customer,
  // along with their Settlement actualDates (for "Thraive 实际收款").
  const customerRecs = await prisma.customerReconciliation.findMany({
    where: { customerId: rec.customerId, deletedAt: null },
    orderBy: { periodStart: "desc" },
    take: 60,
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      feeAmount: true,
      commissionAmount: true,
      actualSalesAmount: true,
      finalSalesAmount: true,
      finalCommissionAmount: true,
      createdAt: true,
      submittedAt: true,
      settlements: {
        select: { type: true, actualDate: true, status: true },
      },
    },
  });

  // Build month → matched CR map (CONFIRMED preferred; fallback to latest non-deleted)
  const monthMap = new Map<string, typeof customerRecs[number]>();
  for (const c of customerRecs) {
    const key = c.periodStart.toISOString().slice(0, 7); // YYYY-MM
    const prev = monthMap.get(key);
    if (!prev) monthMap.set(key, c);
    else if (c.status === "CONFIRMED" && prev.status !== "CONFIRMED") monthMap.set(key, c);
  }

  // Rule snapshot for derive()
  const rule = rec.splitRule;
  const tierBrackets = rule ? parseTieredRules((() => {
    try { return JSON.parse(rule.tieredRules); } catch { return []; }
  })()) : [];

  const derivedPeriods: PeriodDerived[] = rec.periods.map((p) => {
    const month = p.periodLabel ?? "";
    const cr = month ? monthMap.get(month) : undefined;
    const confirmed = cr && cr.status === "CONFIRMED" ? cr : null;
    const feeSettlement = cr?.settlements.find((s) => s.type === "FIXED_FEE" && s.actualDate);
    const commSettlement = cr?.settlements.find((s) => s.type === "COMMISSION" && s.actualDate);

    // Approximate coefficient: full month = 1.0 (partial-month coefficient is captured
    // at period creation time but not persisted; for view we recompute based on label).
    const coefficient = 1.0;

    return deriveChannelPeriod({
      periodIndex: p.periodIndex,
      monthLabel: month,
      coefficient,
      confirmedFee: confirmed ? confirmed.feeAmount : null,
      confirmedGmv: confirmed ? (confirmed.finalSalesAmount ?? confirmed.actualSalesAmount) : null,
      confirmedCommission: confirmed ? (confirmed.finalCommissionAmount ?? confirmed.commissionAmount) : null,
      feeReceivedAt: feeSettlement?.actualDate?.toISOString() ?? null,
      commissionReceivedAt: commSettlement?.actualDate?.toISOString() ?? null,
      fixedFeeRate: rule ? rule.fixedFeeRate : rec.fixedFeeShareRate,
      ruleType: (rule?.ruleType ?? "A") as "A" | "B",
      flatCommissionRate: rule?.ruleType === "A" ? (rule.commissionRate ?? 0) : 0,
      tierBrackets,
    });
  });

  // Best-effort: ensure due-date reminders exist for Shallow (fire-and-forget).
  // Errors here MUST NOT block page render.
  try {
    await ensureChannelDueDateReminders(rec.id, derivedPeriods);
  } catch {}

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
      derivedPeriods={derivedPeriods}
    />
  );
}
