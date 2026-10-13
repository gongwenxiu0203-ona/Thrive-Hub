/** A missing/explicitly disabled/zero fee is not a billable fixed-fee stream. */
export function hasBillableFixedFee(contract: { feeCycle?: string | null; feeAmount?: string | number | null }): boolean {
  if (["无", "NONE", "NO", "不收取"].includes(String(contract.feeCycle ?? "").trim().toUpperCase())) return false;
  const amount = typeof contract.feeAmount === "number"
    ? contract.feeAmount
    : Number(String(contract.feeAmount ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) && amount > 0;
}

/** Historical timestamps may carry hours: reconciliation identity uses inclusive UTC dates. */
export function reconciliationOverlapWhere(contractId: string, period: { type: string; start: Date; end: Date }) {
  const first = new Date(Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth(), period.start.getUTCDate()));
  const last = new Date(Date.UTC(period.end.getUTCFullYear(), period.end.getUTCMonth(), period.end.getUTCDate() + 1) - 1);
  return {
    contractId,
    projectConfirmationId: null,
    deletedAt: null,
    // Cancelled plans remain intentional tombstones; auto-generation must not revive them.
    reconcileType: { in: [period.type, "BOTH"] },
    periodStart: { lte: last },
    periodEnd: { gte: first },
  };
}
