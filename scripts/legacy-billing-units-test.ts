import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { closeContractReconciliationPlans, closeLegacyBillingUnitReconciliationPlans, ensureCustomerReconciliationPlan, ensureLegacyBillingUnits } from "../src/lib/customerReconciliationPlan";

if (!process.env.DATABASE_URL?.includes("thrive-legacy-migration-")) {
  throw new Error("此测试只能在专用临时数据库执行");
}

async function main() {
  const user = await prisma.user.create({ data: { name: "Legacy plan test", email: `legacy-${Date.now()}@example.test`, passwordHash: "test", role: "ADMIN" } });
  const customer = await prisma.customer.create({ data: { brandName: "Legacy Plan Test", status: "COOPERATING" } });
  const startDate = new Date("2026-11-01T00:00:00.000Z");
  const endDate = new Date("2026-11-30T00:00:00.000Z");
  const contract = await prisma.contract.create({ data: {
    contractNo: `LEGACY-PLAN-${Date.now()}`, type: "BRAND", status: "COMPLETED", customerId: customer.id,
    createdById: user.id, startDate, endDate, feeCycle: "月度", feeAmount: "100", commissionRate: "5%",
    targetSite: "US", promoPlatform: "PB",
  } });
  const first = await ensureCustomerReconciliationPlan(contract.id, user.id);
  assert.equal(first.created, 2);
  const units = await prisma.contractLegacyBillingUnit.findMany({ where: { contractId: contract.id } });
  assert.deepEqual(new Set(units.map(unit => unit.kind)), new Set(["FEE_ONLY", "COMMISSION_ONLY"]));
  const records = await prisma.customerReconciliation.findMany({ where: { contractId: contract.id } });
  assert.equal(records.length, 2);
  assert(records.every(record => record.legacyBillingUnitId && !record.projectConfirmationId));
  const again = await ensureCustomerReconciliationPlan(contract.id, user.id);
  assert.equal(again.created, 0);
  assert.equal(await prisma.customerReconciliation.count({ where: { contractId: contract.id } }), 2);
  const fixedUnit = units.find(unit => unit.kind === "FEE_ONLY")!;
  const closing = await prisma.$transaction(tx => closeLegacyBillingUnitReconciliationPlans(fixedUnit.id, new Date("2026-11-15T00:00:00.000Z"), user.id, "isolated test", tx));
  assert.equal(closing.shortened, 1);
  const [fixedRecord, commissionRecord] = await Promise.all([
    prisma.customerReconciliation.findFirstOrThrow({ where: { contractId: contract.id, reconcileType: "FEE_ONLY" } }),
    prisma.customerReconciliation.findFirstOrThrow({ where: { contractId: contract.id, reconcileType: "COMMISSION_ONLY" } }),
  ]);
  assert.equal(fixedRecord.periodEnd.toISOString().slice(0, 10), "2026-11-15");
  assert.equal(commissionRecord.periodEnd.toISOString().slice(0, 10), "2026-11-30");
  await prisma.customerReconciliation.update({ where: { id: commissionRecord.id }, data: { status: "CONFIRMED" } });
  const wholeClose = await closeContractReconciliationPlans(contract.id, new Date("2026-11-10T00:00:00.000Z"), user.id);
  assert.equal(wholeClose.preserved, 1, "whole-contract termination preserves confirmed financial history");
  assert.equal((await prisma.customerReconciliation.findUniqueOrThrow({ where: { id: commissionRecord.id } })).planStatus, "PLANNED");

  const noFee = await prisma.contract.create({ data: {
    contractNo: `LEGACY-NOFEE-${Date.now()}`, type: "BRAND", status: "COMPLETED", customerId: customer.id,
    createdById: user.id, startDate, endDate, feeCycle: "无", feeAmount: "0", commissionRate: "5%",
  } });
  const noFeeResult = await ensureCustomerReconciliationPlan(noFee.id, user.id);
  assert.equal(noFeeResult.created, 1);
  assert.deepEqual((await prisma.contractLegacyBillingUnit.findMany({ where: { contractId: noFee.id }, select: { kind: true } })).map(unit => unit.kind), ["COMMISSION_ONLY"]);
  const oldContract = await prisma.contract.create({ data: {
    contractNo: `LEGACY-REVIEW-${Date.now()}`, type: "BRAND", status: "COMPLETED", customerId: customer.id,
    createdById: user.id, startDate, endDate, feeCycle: "月度", feeAmount: "100", commissionRate: "5%",
  } });
  const oldRecord = await prisma.customerReconciliation.create({ data: {
    customerId: customer.id, contractId: oldContract.id, createdById: user.id,
    periodStart: startDate, periodEnd: endDate, reconcileType: "FEE_ONLY",
    automationKey: `contract:${oldContract.id}:FEE_ONLY:1`,
  } });
  const beforeReview = await ensureCustomerReconciliationPlan(oldContract.id, user.id);
  assert.equal(beforeReview.created, 0);
  assert.equal(await prisma.contractLegacyBillingUnit.count({ where: { contractId: oldContract.id } }), 0);
  await ensureLegacyBillingUnits(oldContract.id, user.id);
  await ensureCustomerReconciliationPlan(oldContract.id, user.id);
  assert((await prisma.customerReconciliation.findUniqueOrThrow({ where: { id: oldRecord.id } })).legacyBillingUnitId, "reviewed draft may be attached without changing its amounts");
  console.log("legacy billing units: identity, idempotence, isolated termination, whole-contract financial-history preservation and no-fixed-fee checks passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
