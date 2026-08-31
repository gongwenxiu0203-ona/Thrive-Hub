import assert from "node:assert/strict";
import { buildConfirmationPeriods, calculateConfirmationCommission, parseConfirmationAmount, parseConfirmationPercent, assertConfirmationCurrency } from "../src/lib/contractConfirmationRules";

const base = { mode: "GMV_SERVICE", scope: "ALL", currency: "USD", gmvCurrency: "USD", effectiveGmv: 1000, ratePercent: 1 } as const;
assert.equal(calculateConfirmationCommission(base).commissionAmount, 10);
assert.equal(parseConfirmationPercent("1%"), 1);
assert.equal(parseConfirmationPercent("0.5%"), 0.5);
assert.equal(calculateConfirmationCommission({ ...base, ratePercent: "0.5" }).commissionAmount, 5);
for (const value of [Infinity, -1, NaN, "", " ", "1e3", "0x10", true, null, "1,000"]) assert.throws(() => parseConfirmationAmount(value));
assert.throws(() => parseConfirmationPercent(101));
assert.throws(() => assertConfirmationCurrency("ZZZ"));
assert.throws(() => calculateConfirmationCommission({ ...base, gmvCurrency: "CNY" }));
for (const effectiveGmv of [999, 1000, 1200]) {
  const result = calculateConfirmationCommission({ ...base, scope: "EXCESS", effectiveGmv, thresholdAmount: 1000, thresholdCurrency: "USD" });
  assert.equal(result.commissionAmount, effectiveGmv > 1000 ? 2 : 0);
}
assert.throws(() => calculateConfirmationCommission({ ...base, scope: "EXCESS", thresholdAmount: 1, thresholdCurrency: "EUR" }));
assert.throws(() => calculateConfirmationCommission({ ...base, mode: "PACKAGE" }), /核定/);
assert.throws(() => calculateConfirmationCommission({ ...base, mode: "PACKAGE", overrideRateConfirmed: true }));
assert.equal(calculateConfirmationCommission({ ...base, mode: "PACKAGE", overrideRateConfirmed: true, overrideRatePercent: 2 }).commissionAmount, 20);
assert.throws(() => calculateConfirmationCommission({ ...base, scope: "CAMPAIGN", verifiedEligibleGmv: 500 }), /核定/);
assert.throws(() => calculateConfirmationCommission({ ...base, scope: "PUBLISHER", eligibleGmvVerified: true, verifiedEligibleGmv: 1001 }));
assert.equal(calculateConfirmationCommission({ ...base, scope: "PUBLISHER", eligibleGmvVerified: true, verifiedEligibleGmv: 500 }).commissionAmount, 5);

const planInput = { confirmationId: "sow-a", startDate: "2024-01-31", endDate: "2024-03-02", fixedFeeEnabled: true, commissionEnabled: true };
const periods = buildConfirmationPeriods(planInput);
assert.deepEqual(periods.filter(p => p.kind === "COMMISSION").map(p => [p.startDate, p.endDate]), [
  ["2024-01-31", "2024-01-31"], ["2024-02-01", "2024-02-29"], ["2024-03-01", "2024-03-02"],
]);
assert.deepEqual(periods.filter(p => p.kind === "FIXED_FEE").map(p => [p.startDate, p.endDate]), [
  ["2024-01-31", "2024-02-29"], ["2024-03-01", "2024-03-02"],
]);
assert.deepEqual(buildConfirmationPeriods(planInput), periods);
assert.equal(planInput.startDate, "2024-01-31");
const other = buildConfirmationPeriods({ ...planInput, confirmationId: "sow-b" });
assert.equal(new Set([...periods, ...other].map(p => p.automationKey)).size, 10);
assert.deepEqual(buildConfirmationPeriods({ ...planInput, fixedFeeEnabled: false, commissionEnabled: false }), []);
assert.ok(buildConfirmationPeriods({ ...planInput, fixedFeeEnabled: false }).every(p => p.kind === "COMMISSION"));
assert.equal(buildConfirmationPeriods({ ...planInput, startDate: "2024-02-29", endDate: "2024-02-29" }).length, 2);
for (const startDate of ["2023-02-29", "not-a-date", "2024-04-01"]) assert.throws(() => buildConfirmationPeriods({ ...planInput, startDate }));
assert.throws(() => buildConfirmationPeriods({ ...planInput, startDate: "1900-01-01" }));
console.log("contract-confirmation-rules: all assertions passed");
