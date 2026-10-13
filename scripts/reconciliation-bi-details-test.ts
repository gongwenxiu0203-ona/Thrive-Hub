import assert from "node:assert/strict";
import { applyBiAdjustments, buildBiSnapshot, invoiceBiLineAllocations, matchesBiProduct, readBiSnapshot, writeBiSnapshot } from "../src/lib/reconciliationBiDetails";
import type { ContractConfirmationDraft } from "../src/lib/contractConfirmationDraft";

const draft = {
  brand: "Edifier",
  scopes: [{ country: "美国", salesPlatforms: ["Amazon"], programs: ["Creator Connections (ACC)"], thirdPartyPlatforms: ["PartnerBoost"] }],
  productScope: "ALL",
  products: [],
} as unknown as ContractConfirmationDraft;
const snapshot = buildBiSnapshot({
  draft, periodLabel: "2026-09-01 ~ 2026-09-30", commissionAmount: 44,
  rows: [
    { brand: "Edifier", region: "US", affiliatePlatform: "PB", orders: 2, revenue: 100 },
    { brand: "Edifier", region: "US", affiliatePlatform: "Amazon Creator Connections", orders: 1, revenue: 10 },
    { brand: "Edifier", region: "CA", affiliatePlatform: "PartnerBoost", orders: 9, revenue: 900 },
    { brand: "Other", region: "US", affiliatePlatform: "PartnerBoost", orders: 9, revenue: 900 },
  ],
});
assert.equal(snapshot.details.length, 2, "brand, region and platform are all enforced");
assert.equal(snapshot.details.reduce((sum, line) => sum + line.salesAmount, 0), 110);
assert.equal(snapshot.details.reduce((sum, line) => sum + line.commissionAmount, 0), 44);
const stored = writeBiSnapshot(JSON.stringify({ schemaVersion: 1, data: { keep: true } }), snapshot);
assert.deepEqual(JSON.parse(stored).data, { keep: true }, "billing rule snapshot remains intact");
assert.equal(readBiSnapshot(stored)?.details.length, 2);
const adjusted = applyBiAdjustments(stored, snapshot.details.map((line, index) => ({ key: line.key, amount: index ? 20 : 80 })));
assert.equal(adjusted?.details.reduce((sum, line) => sum + line.adjustedSalesAmount, 0), 100);
assert.equal(applyBiAdjustments(stored, [{ key: "stale", amount: 1 }]), null, "stale partial edits are rejected");
const specified = buildBiSnapshot({
  draft: { ...draft, productScope: "SPECIFIED", products: [{ asinOrUrl: "B012345678" }] } as ContractConfirmationDraft,
  periodLabel: "2026-09", commissionAmount: 10,
  rows: [{ brand: "Edifier", region: "US", affiliatePlatform: "PB", asin: "B012345678", orders: 1, revenue: 100 }],
});
assert.equal(matchesBiProduct(specified, { asin: "B012345678" }), true);
assert.equal(matchesBiProduct(specified, { asin: "B098765432" }), false, "statement export must not widen specified product scope");
assert.deepEqual(invoiceBiLineAllocations(snapshot.details, 44).reduce((a, b) => a + b, 0), 44);
assert.throws(() => invoiceBiLineAllocations([{ ...snapshot.details[0], adjustedSalesAmount: -1 }], 44), /负销售额/);
console.log("Reconciliation BI scope and detail snapshot checks passed.");
