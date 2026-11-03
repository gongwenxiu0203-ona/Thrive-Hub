import assert from "node:assert/strict";
import { validateOptionalPaymentReferences } from "../src/lib/paymentReferences";

async function main() {
  let invoiceCalls = 0;
  let receiptCalls = 0;
  let receiptWhere: any;
  let invoiceValid = true;
  let receiptValid = true;
  const tx = {
    invoice: { findFirst: async () => { invoiceCalls++; return invoiceValid ? { id: "inv", customerId: "customer", accountsReceivableId: "ar" } : null; } },
    customerReceipt: { findFirst: async (args: any) => { receiptCalls++; receiptWhere = args.where; return receiptValid ? { id: "receipt" } : null; } },
  } as unknown as Parameters<typeof validateOptionalPaymentReferences>[0];
  await validateOptionalPaymentReferences(tx);
  assert.equal(invoiceCalls, 0); assert.equal(receiptCalls, 0);
  await validateOptionalPaymentReferences(tx, "inv");
  assert.equal(invoiceCalls, 1); assert.equal(receiptCalls, 0);
  await validateOptionalPaymentReferences(tx, undefined, "receipt");
  assert.equal(invoiceCalls, 1); assert.equal(receiptCalls, 1);
  assert.equal(receiptWhere.allocations, undefined);
  assert.equal(receiptWhere.id, "receipt");
  assert.deepEqual(receiptWhere.status, { not: "REVERSED" });
  await validateOptionalPaymentReferences(tx, "inv", "receipt");
  assert.equal(receiptWhere.customerId, "customer");
  assert.equal(receiptWhere.allocations.some.status, "ACTIVE");
  assert.deepEqual(receiptWhere.allocations.some.allocatedAmount, { gt: 0 });
  assert.deepEqual(receiptWhere.allocations.some.OR, [{ invoiceId: "inv" }, { accountsReceivableId: "ar" }]);
  invoiceValid = false;
  await assert.rejects(validateOptionalPaymentReferences(tx, "invalid"), /票据不存在/);
  invoiceValid = true; receiptValid = false;
  await assert.rejects(validateOptionalPaymentReferences(tx, undefined, "invalid"), /不存在或已冲销/);
  await assert.rejects(validateOptionalPaymentReferences(tx, "inv", "mismatch"), /尚未有效核销/);
  console.log("Optional payment references: neither, either, both and invalid references passed.");
}
main();
