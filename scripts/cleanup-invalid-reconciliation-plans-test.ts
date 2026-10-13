import assert from "node:assert/strict";
import { planCleanup } from "./cleanup-invalid-reconciliation-plans";

type TestRow = Parameters<typeof planCleanup>[0][number];
const stamp = (value: string) => new Date(`${value}T00:00:00.000Z`);
function row(id: string, overrides: Record<string, unknown> = {}): TestRow {
  return {
    id, contractId: "contract-1", projectConfirmationId: null, ruleSnapshot: null,
    reconcileType: "FEE_ONLY", periodStart: stamp("2026-09-01"), periodEnd: stamp("2026-09-30"),
    source: "AUTO", status: "DRAFT", planStatus: "OPEN", submittedAt: null,
    submittedById: null, submittedToUserId: null, automationKey: null,
    feeAmount: 100, createdAt: stamp("2026-09-01"), updatedAt: stamp("2026-09-01"),
    partyA: null, accountingPeriod: null, feeCycle: null, affiliateRule: null,
    paymentCycle: null, adjustmentReason: null, openedAt: null, finalFeeAmount: null,
    finalSalesAmount: null, finalCommissionAmount: null, actualSalesAmount: 0, actualOrders: 0,
    contract: { contractNo: "TEST-001", feeCycle: "月度", feeAmount: "100" },
    _count: { reviews: 0, settlements: 0, channelReconciliations: 0, invoiceLinks: 0,
      periodAudits: 0, billingRequestLines: 0, billingAllocations: 0,
      receiptAllocations: 0, channelPayableSources: 0 },
    ...overrides,
  } as TestRow;
}

const duplicate = planCleanup([
  row("old"),
  row("new", { createdAt: stamp("2026-09-02"), updatedAt: stamp("2026-09-02") }),
]);
assert.deepEqual(duplicate.candidates.map((value) => value.id), ["old"]);
assert.deepEqual(duplicate.keepers.map((value) => value.id), ["new"]);

const distinct = planCleanup([
  row("one"), row("partial", { periodEnd: stamp("2026-09-29") }),
  row("other-confirmation", { projectConfirmationId: "confirmation-2" }),
]);
assert.equal(distinct.candidates.length, 0);

const protectedPlan = planCleanup([
  row("draft"), row("confirmed", { status: "CONFIRMED" }),
]);
assert.deepEqual(protectedPlan.candidates.map((value) => value.id), ["draft"]);
assert.deepEqual(protectedPlan.keepers.map((value) => value.id), ["confirmed"]);

const multipleProtected = planCleanup([
  row("draft"), row("confirmed", { status: "CONFIRMED" }),
  row("audited", { _count: { ...row("x")._count, periodAudits: 1 } }),
]);
assert.equal(multipleProtected.candidates.length, 0);
assert.equal(multipleProtected.blocked.length, 3);

const noFee = planCleanup([row("no-fee", { contract: { contractNo: "TEST-001", feeCycle: "无", feeAmount: "0" } })]);
assert.deepEqual(noFee.candidates.map((value) => value.id), ["no-fee"]);
const noFeeProtected = planCleanup([row("no-fee-audited", {
  contract: { contractNo: "TEST-001", feeCycle: "无", feeAmount: "0" },
  _count: { ...row("x")._count, periodAudits: 1 },
})]);
assert.equal(noFeeProtected.candidates.length, 0);
assert.equal(noFeeProtected.blocked.length, 1);

const missingSnapshot = planCleanup([row("missing", { projectConfirmationId: "confirmation-1" })]);
assert.equal(missingSnapshot.candidates.length, 0);
assert.equal(missingSnapshot.blocked.length, 1);
const missingSnapshotGroup = planCleanup([
  row("missing-a", { projectConfirmationId: "confirmation-1" }),
  row("missing-b", { projectConfirmationId: "confirmation-1", updatedAt: stamp("2026-09-02") }),
]);
assert.equal(missingSnapshotGroup.candidates.length, 0);
assert.equal(missingSnapshotGroup.blocked.length, 2);

assert.notEqual(duplicate.digest, protectedPlan.digest);
console.log("cleanup-invalid-reconciliation-plans: 8 rule cases passed");
