import assert from "node:assert/strict";
import {
  confirmationDraftSchema, confirmationDraftSnapshot, confirmationOptionKey,
  parseEffectiveConfirmation, type ContractConfirmationDraft,
} from "../src/lib/contractConfirmationDraft";

const draft: ContractConfirmationDraft = {
  contractId: "contract-test", title: "项目确认书", brand: "测试品牌", storeUrl: "",
  startDate: "2026-08-01", endDate: "2026-12-31", minimumMonths: 0,
  partyAContact: { name: "甲", email: "a@example.com", phone: "" },
  partyBContact: { name: "乙", email: "b@example.com", phone: "" },
  receivingAccountIds: ["account-a", "account-b"],
  scopes: [
    { country: "美国", salesPlatforms: ["Amazon"], programs: ["ACC", "自定义Program"], thirdPartyPlatforms: ["Levanta", "其他已录入平台"] },
    { country: "英国", salesPlatforms: ["Shopify"], programs: ["自定义Program2"], thirdPartyPlatforms: ["无"] },
  ],
  productScope: "ALL", products: [], serviceDescription: "推广服务",
  monthlyFee: { amount: 1500, currency: "USD" },
  commission: { mode: "GMV_SERVICE", currency: "USD", packageValue: null, serviceRatePercent: 1,
    basis: "ALL", threshold: null, thresholdCurrency: null, basisEvidence: "" },
  additionalFees: [], attributionWindowDays: 30, orderLockDays: 30, tailDays: 30,
  tailTerms: "终止前已形成归因记录", salesSources: ["ACC"], taxBasis: "EXCLUSIVE", paymentTerms: "按确认书约定", note: "",
};

assert.equal(parseEffectiveConfirmation(draft).commission?.serviceRatePercent, 1);
assert.equal(parseEffectiveConfirmation(draft).receivingAccountIds.length, 2);
assert.equal(parseEffectiveConfirmation(draft).scopes[1].country, "英国");
assert.equal(confirmationOptionKey(" ＡＣＣ  "), "acc");
assert.throws(() => parseEffectiveConfirmation({ ...draft, startDate: "2026-02-30" }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, endDate: "2025-01-01" }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, receivingAccountIds: ["a", "a"] }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, receivingAccountIds: [] }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, scopes: [] }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, scopes: [{ ...draft.scopes[0], programs: ["ACC", " acc "] }] }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, monthlyFee: { amount: Infinity, currency: "USD" } }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, monthlyFee: { amount: -1, currency: "USD" } }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, monthlyFee: { amount: 1, currency: "ZZZ" } }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, monthlyFee: null, commission: null }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, productScope: "SPECIFIED", products: [] }));
assert.equal(confirmationDraftSchema.safeParse({ ...draft, storeUrl: "" }).success, true);
assert.doesNotThrow(() => confirmationDraftSchema.safeParse({ ...draft, storeUrl: "not-a-url" }));
assert.equal(confirmationDraftSchema.safeParse({ ...draft, storeUrl: "not-a-url" }).success, false);
assert.throws(() => parseEffectiveConfirmation({ ...draft, storeUrl: "javascript:alert(1)" }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, status: "EFFECTIVE" })); // Server-owned status.
assert.throws(() => parseEffectiveConfirmation({ ...draft, commission: { ...draft.commission, basis: "CAMPAIGN" } }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, commission: { ...draft.commission, basis: "EXCESS", threshold: 100, thresholdCurrency: "CNY" } }));
assert.throws(() => parseEffectiveConfirmation({ ...draft, commission: { ...draft.commission, mode: "PACKAGE", packageValue: "15%" } }));
const packageDraft = { ...draft, commission: { ...draft.commission!, mode: "PACKAGE" as const, packageValue: "15%", serviceRatePercent: null } };
assert.equal(parseEffectiveConfirmation(packageDraft).commission?.packageValue, "15%");
assert.throws(() => parseEffectiveConfirmation({ ...packageDraft, commission: { ...packageDraft.commission, packageValue: " " } }));
assert.equal(confirmationDraftSchema.parse({ ...draft, startDate: null, endDate: null, scopes: [], receivingAccountIds: [] }).startDate, null);
assert.throws(() => parseEffectiveConfirmation({ ...draft, startDate: null, endDate: null }));
const snapshot = JSON.parse(confirmationDraftSnapshot(draft));
assert.equal(snapshot.schemaVersion, 1);
assert.deepEqual(snapshot.data, draft);
assert.equal(parseEffectiveConfirmation({ ...draft, commission: null }).commission, null); // Fee only is valid.
assert.equal(parseEffectiveConfirmation({ ...draft, monthlyFee: null }).monthlyFee, null); // Commission only is valid.
console.log("PASS: confirmation draft/effectiveness, multi-account/scopes, custom options and snapshots (no database access)");
