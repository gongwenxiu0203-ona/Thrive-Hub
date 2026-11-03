import assert from "node:assert/strict";
import { createPayeeSnapshot, financePayeeDetails, isPayeeCategoryAllowed } from "../src/lib/financePayee";

for (const [request, type] of [["CHANNEL", "CHANNEL_PAYEE"], ["AFFILIATE", "AFFILIATE_PAYEE"], ["SUPPLIER", "SUPPLIER_PAYEE"], ["SUPPLIER", "SUPPLIER_BANK"]]) {
  assert.equal(isPayeeCategoryAllowed(request, type), true);
}
assert.equal(isPayeeCategoryAllowed("CHANNEL", "AFFILIATE_PAYEE"), false);
assert.equal(isPayeeCategoryAllowed("AFFILIATE", "SUPPLIER_PAYEE"), false);
assert.equal(isPayeeCategoryAllowed("SUPPLIER", "EMPLOYEE_REIMBURSEMENT"), false);
for (const type of ["CHANNEL_PAYEE", "AFFILIATE_PAYEE", "SUPPLIER_PAYEE", "EMPLOYEE_REIMBURSEMENT"]) {
  assert.equal(isPayeeCategoryAllowed("OTHER", type), true);
  assert.equal(isPayeeCategoryAllowed("TAX", type), true);
  assert.equal(isPayeeCategoryAllowed("PAYROLL", type), true);
}
const source = { name: "Affiliate A", accountType: "AFFILIATE_PAYEE", country: "US", bankName: "Test Bank", routingNumber: "001234567", bankAddress: "Bank address", accountHolderType: "business", currency: "USD", accountName: "Holder", accountNumber: "000123", bankAccountType: "checking", accountHolderMobile: "+12345678", accountHolderEmail: "holder@example.com", payeeAddress: "Address 00001", swiftCode: "TESTUSXX", note: "Account note", createdById: "must-not-expose" };
const snapshot = createPayeeSnapshot(source);
assert.equal("createdById" in snapshot, false);
assert.equal(snapshot.accountNumber, "000123");
assert.equal(snapshot.routingNumber, "001234567");
const stored = JSON.stringify(snapshot);
source.accountName = "Changed afterwards";
assert.equal(JSON.parse(stored).accountName, "Holder");
const details = financePayeeDetails(stored);
assert.equal(details.length, 15);
for (const value of ["Affiliate A", "US", "Test Bank", "001234567", "Bank address", "企业 business", "USD", "Holder", "000123", "checking", "+12345678", "holder@example.com", "Address 00001", "TESTUSXX", "Account note"]) assert.ok(details.some(row => row.value === value), value);
assert.ok(financePayeeDetails('{"accountName":"Old"}').some(row => row.value === "Old"));
for (const invalid of ["oops", "null", "[]", "123", null]) assert.ok(financePayeeDetails(invalid).every(row => row.value === "—"));
console.log("Finance payee category, snapshot preservation and full details tests passed.");
