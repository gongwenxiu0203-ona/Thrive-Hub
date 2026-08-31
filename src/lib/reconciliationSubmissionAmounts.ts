import { AppError } from "./appError";

type RecordAmounts = {
  reconcileType: string;
  actualSalesAmount: number;
  feeAmount: number;
  finalFeeAmount: number | null;
  commissionAmount: number;
};

type DecisionAmounts = {
  decision: "APPROVED" | "DISPUTED";
  correctedSalesAmount?: number;
  correctedFeeAmount?: number;
};

/** Never convert the absent sales correction on a fixed-fee dispute to NaN. */
export function resolveSubmissionAmounts(
  record: RecordAmounts,
  decision: DecisionAmounts,
  calculatedCommission?: number,
) {
  const fixedFee = record.reconcileType === "FEE_ONLY";
  const disputed = decision.decision === "DISPUTED";
  const correctedSales = disputed && !fixedFee
    ? decision.correctedSalesAmount
    : record.actualSalesAmount;
  const correctedFee = disputed && fixedFee
    ? decision.correctedFeeAmount
    : (record.finalFeeAmount ?? record.feeAmount);
  const finalCommission = fixedFee
    ? record.commissionAmount
    : (calculatedCommission ?? record.commissionAmount);

  for (const [label, value] of [
    ["销售额", correctedSales],
    ["固费金额", correctedFee],
    ["销售佣金", finalCommission],
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new AppError(`${label}无效，请刷新记录并检查金额后重新提交`, 400, "RECONCILIATION_INVALID_AMOUNT");
    }
  }
  return { correctedSales: correctedSales!, correctedFee: correctedFee!, finalCommission };
}
