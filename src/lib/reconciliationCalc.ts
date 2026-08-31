import { prisma } from "@/lib/prisma";
import { calcCommission } from "@/lib/commissionCalc";
import { calculateConfirmationCommission } from "./contractConfirmationRules";
import { readReconciliationConfirmation, confirmationSubmissionIssue, type ConfirmationReconciliation } from "./reconciliationConfirmation";
import { AppError } from "./appError";

export function assertConfirmationReadyForSubmission(rec: ConfirmationReconciliation) {
  const issue = confirmationSubmissionIssue(rec);
  if (issue) throw new AppError(issue, 400, "CONFIRMATION_RECONCILIATION_NOT_READY");
}

export async function recalcReconciliation(
  recId: string,
  patch: Record<string, unknown>,
): Promise<{ actualCommissionRate: number; commissionAmount: number; betResult: string }> {
  const rec = await prisma.customerReconciliation.findUnique({
    where: { id: recId },
    select: {
      projectConfirmationId: true,
      ruleSnapshot: true,
      confirmedCommissionRate: true,
      reconcileType: true,
      commissionCurrency: true,
      commissionRate: true,
      actualSalesAmount: true,
      gmvBaseline: true,
      contract: {
        select: {
          commissionType: true,
          commissionRate: true,
          thresholdAmount: true,
          tieredRules: true,
        },
      },
    },
  });
  if (!rec) return { actualCommissionRate: 0, commissionAmount: 0, betResult: "NA" };

  if (rec.projectConfirmationId) {
    if (rec.reconcileType === "FEE_ONLY") return { actualCommissionRate: 0, commissionAmount: 0, betResult: "NA" };
    const draft = readReconciliationConfirmation(rec);
    if (!draft?.commission) throw new AppError("项目确认书佣金快照无效", 400);
    const rate = typeof patch.confirmedCommissionRate === "number" ? patch.confirmedCommissionRate : rec.confirmedCommissionRate;
    assertConfirmationReadyForSubmission({ ...rec, confirmedCommissionRate: rate });
    const commission = draft.commission;
    try {
      const result = calculateConfirmationCommission({
        mode: commission.mode, scope: commission.basis,
        currency: commission.currency,
        gmvCurrency: typeof patch.commissionCurrency === "string" ? patch.commissionCurrency : rec.commissionCurrency,
        effectiveGmv: typeof patch.actualSalesAmount === "number" ? patch.actualSalesAmount : rec.actualSalesAmount,
        ratePercent: commission.serviceRatePercent,
        thresholdAmount: commission.threshold, thresholdCurrency: commission.thresholdCurrency ?? undefined,
        overrideRatePercent: rate == null ? undefined : rate * 100,
        overrideRateConfirmed: rate != null,
      });
      return { actualCommissionRate: result.ratePercent / 100, commissionAmount: result.commissionAmount, betResult: "NA" };
    } catch (error) { throw new AppError(error instanceof Error ? error.message : "确认书佣金计算失败", 400); }
  }

  const actualSalesAmount = typeof patch.actualSalesAmount === "number"
    ? patch.actualSalesAmount
    : rec.actualSalesAmount;
  const gmvBaseline = typeof patch.gmvBaseline === "number"
    ? patch.gmvBaseline
    : (rec.gmvBaseline ?? null);
  const contractRateParsed = parseRatePctServer(rec.contract?.commissionRate);
  const contractRate = contractRateParsed > 0 ? contractRateParsed : rec.commissionRate;
  const result = calcCommission({
    commissionType: rec.contract?.commissionType ?? "FIXED",
    contractRate,
    thresholdAmount: rec.contract?.thresholdAmount ?? null,
    tieredRules: rec.contract?.tieredRules ?? null,
    gmvBaseline,
    actualSalesAmount,
  });
  return {
    actualCommissionRate: result.actualCommissionRate,
    commissionAmount: result.commissionAmount,
    betResult: "NA",
  };
}

function parseRatePctServer(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value > 1 ? value / 100 : value;
  const parsed = Number(String(value).replace(/[%\s]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

export function calcBetAndCommission(rec: {
  betType?: string;
  betOrderCount?: number | null;
  betSalesAmount?: number | null;
  actualOrders?: number;
  actualSalesAmount: number;
  commissionRate: number;
}) {
  const actualCommissionRate = rec.commissionRate;
  const commissionAmount = rec.actualSalesAmount * actualCommissionRate;
  return { betResult: "NA", actualCommissionRate, commissionAmount };
}
