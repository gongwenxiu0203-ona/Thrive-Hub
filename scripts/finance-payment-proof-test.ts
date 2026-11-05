import assert from "node:assert/strict";
import { containsExactPaymentProof, findLegacyPaymentProof } from "../src/lib/financePaymentProof";

async function main() {
  const url = "/uploads/example.pdf";
  assert.equal(containsExactPaymentProof(JSON.stringify([url]), url), true);
  for (const value of ["bad JSON", "null", JSON.stringify({ url }), JSON.stringify([url + ".other"]), JSON.stringify(["https://example.com/example.pdf"])]) assert.equal(containsExactPaymentProof(value, url), false);
  const calls: Array<{ kind: string; args: unknown }> = [];
  let paymentFiles = JSON.stringify([url]);
  const db = {
    paymentRequest: { findMany: async (args: unknown) => { calls.push({ kind: "payment", args }); return [{ id: "pay", applicantId: "owner", paymentProofUrls: paymentFiles }]; } },
    expenseClaim: { findMany: async (args: unknown) => { calls.push({ kind: "expense", args }); return [{ id: "expense", employeeId: "employee", paymentProofUrls: JSON.stringify([url]) }]; } },
  } as unknown as Parameters<typeof findLegacyPaymentProof>[0];
  assert.deepEqual(await findLegacyPaymentProof(db, url), { entityType: "PAYMENT_REQUEST", entityId: "pay", uploadedById: "owner" });
  assert.equal(calls.length, 1);
  assert.equal((calls[0].args as { where: { status: string } }).where.status, "PAID");
  paymentFiles = JSON.stringify([url + ".other"]);
  assert.deepEqual(await findLegacyPaymentProof(db, url), { entityType: "EXPENSE_CLAIM", entityId: "expense", uploadedById: "employee" });
  assert.equal(await findLegacyPaymentProof(db, "https://example.com/test-payment-proof.pdf"), null);
  assert.equal(await findLegacyPaymentProof(db, "/uploads/nested/file.pdf"), null);
  console.log("Payment proof exact JSON matching and legacy payment/expense fallback passed; no database writes.");
}
main();
