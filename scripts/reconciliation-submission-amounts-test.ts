import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { resolveSubmissionAmounts } from "../src/lib/reconciliationSubmissionAmounts";

const fixed = { reconcileType: "FEE_ONLY", actualSalesAmount: 17, feeAmount: 1800, finalFeeAmount: null, commissionAmount: 0 };
const corrected = resolveSubmissionAmounts(fixed, { decision: "DISPUTED", correctedFeeAmount: 12204 });
assert.deepEqual(corrected, { correctedSales: 17, correctedFee: 12204, finalCommission: 0 });
assert.equal(resolveSubmissionAmounts(fixed, { decision: "DISPUTED", correctedFeeAmount: 0 }).correctedFee, 0);
assert.equal(resolveSubmissionAmounts({ ...fixed, finalFeeAmount: 1200 }, { decision: "APPROVED" }).correctedFee, 1200);
const commission = { ...fixed, reconcileType: "COMMISSION_ONLY", commissionAmount: 10 };
assert.deepEqual(resolveSubmissionAmounts(commission, { decision: "DISPUTED", correctedSalesAmount: 1000 }, 15), {
  correctedSales: 1000, correctedFee: 1800, finalCommission: 15,
});
assert.equal(resolveSubmissionAmounts(commission, { decision: "APPROVED" }).finalCommission, 10);
for (const invalid of [undefined, NaN, Infinity, -1]) {
  assert.throws(() => resolveSubmissionAmounts(fixed, { decision: "DISPUTED", correctedFeeAmount: invalid }), /固费金额无效/);
  assert.throws(() => resolveSubmissionAmounts(commission, { decision: "DISPUTED", correctedSalesAmount: invalid }), /销售额无效/);
}
assert.throws(() => resolveSubmissionAmounts(commission, { decision: "DISPUTED", correctedSalesAmount: 100 }, Infinity), /销售佣金无效/);

async function validatePrismaArguments() {
  // Opt-in local check: an impossible, verified-absent ID means zero business rows change.
  const db = new PrismaClient();
  try {
    const id = `nonexistent-regression-${randomUUID()}`;
    assert.equal(await db.customerReconciliation.count({ where: { id } }), 0);
    const data = {
      status: "CONFIRMED", submittedById: "nonexistent-regression-user",
      submittedToUserId: null, submittedAt: new Date(), submittedDeadline: null,
      actualSalesAmount: corrected.correctedSales, finalSalesAmount: corrected.correctedSales,
      finalFeeAmount: corrected.correctedFee, finalCommissionAmount: corrected.finalCommission,
      fixedFeeCurrency: "CNY", settlementReminderSent: false,
    };
    await assert.rejects(db.customerReconciliation.updateMany({
      where: { id }, data: { ...data, actualSalesAmount: NaN, finalSalesAmount: NaN },
    }), /Unknown argument `submittedById`/);
    assert.equal((await db.customerReconciliation.updateMany({ where: { id }, data })).count, 0);
    console.log("Prisma regression reproduced NaN/submittedById error; corrected arguments accepted; zero rows modified.");
  } finally { await db.$disconnect(); }
}

async function main() {
  if (process.argv.includes("--prisma")) await validatePrismaArguments();
  console.log("Reconciliation submission amounts tests passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
