import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { fillFrameworkDocument } from "../src/lib/frameworkDocument";
import { nextConfirmationNumber } from "../src/lib/confirmationNumber";
import { confirmationDraftSchema } from "../src/lib/contractConfirmationDraft";

async function main() {
  assert.equal(nextConfirmationNumber("MAIN-2026-001", ["MAIN-2026-001-001", "MAIN-2026-001-003", "OTHER"]), "MAIN-2026-001-004");
  const file = process.argv[2];
  if (!file) throw new Error("Pass the V3.2 reference DOCX path; no application database is opened");
  const source = await readFile(file);
  const master = { contractNo: "TEST-2026-001", partyA: "Test A & Co", partyACreditCode: "CODE-A", partyAAddress: "Address A", partyAContact: "Contact A", partyAEmail: "a@example.invalid", partyAPhone: "12345678", partyB: "Test B", partyBCreditCode: "CODE-B", partyBAddress: "Address B", partyBContact: "Contact B", partyBEmail: "b@example.invalid", partyBPhone: "87654321", accounts: [{ accountName: "ACCOUNT-ONE", accountNumber: "123456", bankName: "Bank1" }, { accountName: "ACCOUNT-TWO", accountNumber: "654321", bankName: "Bank2" }] };
  const draft = confirmationDraftSchema.parse({ contractId: "fixture", title: "", brand: "TEST-BRAND", storeUrl: "", startDate: "2026-08-01", endDate: "2026-12-31", minimumMonths: 6, partyAContact: { name: "Contact A", email: "a@example.invalid", phone: "12345678" }, partyBContact: { name: "Contact B", email: "b@example.invalid", phone: "87654321" }, receivingAccountIds: ["one", "two"], scopes: [{ country: "英国", salesPlatforms: ["Amazon", "Shopify"], programs: ["ACC"], thirdPartyPlatforms: ["Levanta"] }], productScope: "ALL", products: [], serviceDescription: "TEST-SERVICE", monthlyFee: { currency: "GBP", amount: 1234 }, commission: { mode: "PACKAGE", currency: "GBP", packageValue: "15%", serviceRatePercent: null, basis: "ALL", threshold: null, thresholdCurrency: null, basisEvidence: "" }, additionalFees: [], attributionWindowDays: 30, orderLockDays: 30, tailDays: 30, tailTerms: "TEST-TAIL", salesSources: ["ACC"], taxBasis: "EXCLUSIVE", paymentTerms: "TEST-PAYMENT", note: "" });
  const original = await JSZip.loadAsync(source);
  for (const selection of ["master", "confirmation", "both"] as const) {
    const output = await fillFrameworkDocument(source, master, selection, { number: "TEST-2026-001-001", draft });
    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file("word/document.xml")!.async("string");
    assert.ok(xml.includes("TEST-2026-001"));
    if (selection !== "confirmation") { assert.ok(xml.includes("ACCOUNT-ONE")); assert.ok(xml.includes("ACCOUNT-TWO")); assert.ok(!xml.includes("0581350002448827")); }
    if (selection !== "master") {
      assert.ok(xml.includes("TEST-BRAND")); assert.ok(xml.includes("GBP 1234/月")); assert.ok(xml.includes("总包佣金：15%"));
      assert.ok(xml.includes("☑ Amazon")); assert.ok(xml.includes("☐ Walmart")); assert.ok(xml.includes("☑ Shopify"));
      assert.ok(xml.includes("☑ Creator Connections（ACC）")); assert.ok(xml.includes("☐ Attribution"));
      assert.ok(xml.includes("☑ Levanta")); assert.ok(xml.includes("☐ PartnerBoost")); assert.ok(xml.includes("☑ 全店商品"));
      assert.ok(xml.includes("☑ 总包佣金")); assert.ok(xml.includes("☐ GMV服务佣金"));
    }
    else assert.ok(!xml.includes("TEST-BRAND"));
    for (const name of Object.keys(original.files)) {
      if (name === "word/document.xml" || original.files[name].dir) continue;
      assert.deepEqual(await zip.file(name)!.async("nodebuffer"), await original.file(name)!.async("nodebuffer"), `Unexpected modification: ${name}`);
    }
  }
  assert.deepEqual(await readFile(file), source);
  console.log("PASS: numbering, three export scopes, preserved checked/unchecked template options, multi-account, package fees, unchanged source and other OOXML parts (in-memory only)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
