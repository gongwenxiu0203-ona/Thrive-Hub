import assert from "node:assert/strict";
import { hasBillableFixedFee, reconciliationOverlapWhere } from "../src/lib/reconciliationGenerationRules";

for (const feeAmount of [null, "", "0", "USD 0", "-10", "invalid"]) {
  assert.equal(hasBillableFixedFee({ feeAmount, feeCycle: "月度" }), false);
}
assert.equal(hasBillableFixedFee({ feeAmount: "1,000 USD", feeCycle: "无" }), false);
assert.equal(hasBillableFixedFee({ feeAmount: "1,000 USD", feeCycle: "NONE" }), false);
assert.equal(hasBillableFixedFee({ feeAmount: "$1,000.50", feeCycle: "月度" }), true);
assert.equal(hasBillableFixedFee({ feeAmount: "500", feeCycle: null }), true);

const query = reconciliationOverlapWhere("contract-a", {
  type: "COMMISSION_ONLY", start: new Date("2026-09-01T15:57:00Z"), end: new Date("2026-09-30T09:52:00Z"),
});
assert.equal(query.contractId, "contract-a");
assert.equal(query.projectConfirmationId, null, "independent confirmations must not block legacy generation");
assert.equal(query.deletedAt, null);
assert.deepEqual(query.reconcileType.in, ["COMMISSION_ONLY", "BOTH"]);
assert.equal(query.periodStart.lte.toISOString(), "2026-09-30T23:59:59.999Z");
assert.equal(query.periodEnd.gte.toISOString(), "2026-09-01T00:00:00.000Z");
assert.equal("automationKey" in query, false, "old/manual records without the new key must also block duplicates");
assert.equal("planStatus" in query, false, "cancelled periods must not be automatically revived");
console.log("Reconciliation fee eligibility and date-overlap regression checks passed.");
