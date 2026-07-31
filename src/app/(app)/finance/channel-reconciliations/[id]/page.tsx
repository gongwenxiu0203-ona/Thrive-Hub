import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { channelReconciliationScope } from "@/lib/dataScope";
import { requireFeaturePermission, hasPermissionLevel } from "@/lib/permissionGuard";
import { deriveChannelPeriod, parseTieredRules, type PeriodDerived } from "@/lib/channelSplit";
import { ensureChannelDueDateReminders } from "@/actions/channelSplit";
import { ChannelReconciliationDetail } from "./ChannelReconciliationDetail";

export const dynamic = "force-dynamic";
export const metadata = { title: "渠道商分账详情 · Thraive联盟营销系统" };

function toShanghaiDateString(value: Date | null): string | null {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseChannelPayeeSnapshot(value: string) {
  const empty = {
    paymentMethod: "",
    beneficiary: "",
    accountNo: "",
    bankName: "",
    bankAddress: "",
    swiftCode: "",
    paypalAccount: "",
    note: "",
  };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(empty).map((key) => [key, typeof parsed[key] === "string" ? parsed[key] : ""]),
    ) as typeof empty;
  } catch {
    return empty;
  }
}

export default async function ChannelReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const permission = await requireFeaturePermission(session, "finance.channel_reconciliation", "READ");
  const canEdit = hasPermissionLevel(permission, "EDIT") && isStaff(session.role);
  const canManage = hasPermissionLevel(permission, "MANAGE");
  const { id } = await params;

  const rec = await prisma.channelReconciliation.findFirst({
    where: {
      AND: [
        { id },
        channelReconciliationScope(session, canManage ? "all" : "mine"),
      ],
    },
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
        recordMode: rec.recordMode,
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
        periodStart: toShanghaiDateString(rec.periodStart),
        periodEnd: toShanghaiDateString(rec.periodEnd),
        fixedFeeReceivedCurrency: rec.fixedFeeReceivedCurrency,
        commissionReceivedCurrency: rec.commissionReceivedCurrency,
        channelPayeeSnapshot: parseChannelPayeeSnapshot(rec.channelPayeeSnapshot),
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
          splitEndDate: toShanghaiDateString(rec.splitRule.splitEndDate)!,
          fixedFeeRate: rec.splitRule.fixedFeeRate,
          commissionRate: rec.splitRule.commissionRate,
          commissionThresholdAmount: rec.splitRule.commissionThresholdAmount,
          commissionThresholdCurrency: rec.splitRule.commissionThresholdCurrency,
          commissionBelowRate: rec.splitRule.commissionBelowRate,
          commissionAtOrAboveRate: rec.splitRule.commissionAtOrAboveRate,
          tieredRules: rec.splitRule.tieredRules,
        } : null,
        periods: rec.periods.map((p) => ({
          id: p.id,
          streamType: p.streamType as "BOTH" | "FIXED_FEE" | "COMMISSION",
          periodIndex: p.periodIndex,
          periodLabel: p.periodLabel,
          periodStart: toShanghaiDateString(p.periodStart),
          periodEnd: toShanghaiDateString(p.periodEnd),
          fixedFeeAmount: p.fixedFeeAmount,
          commissionAmount: p.commissionAmount,
          fixedFeePaidAt: toShanghaiDateString(p.fixedFeePaidAt),
          commissionPaidAt: toShanghaiDateString(p.commissionPaidAt),
          fixedFeeReceived: p.fixedFeeReceived,
          commissionReceived: p.commissionReceived,
          fixedFeeShareRate: p.fixedFeeShareRate,
          commissionShareRate: p.commissionShareRate,
          fixedFeeShareAmount: p.fixedFeeShareAmount,
          commissionShareAmount: p.commissionShareAmount,
          fixedFeeReceivedCurrency: p.fixedFeeReceivedCurrency,
          commissionReceivedCurrency: p.commissionReceivedCurrency,
          fixedFeeSplitDate: p.fixedFeeSplitDate?.toISOString() ?? null,
          commissionSplitDate: p.commissionSplitDate?.toISOString() ?? null,
          confirmedGmv: p.confirmedGmv,
          proofUrl: p.proofUrl,
          notes: p.notes,
        })),
      }}
      derivedPeriods={derivedPeriods}
      canEdit={canEdit}
    />
  );
}
