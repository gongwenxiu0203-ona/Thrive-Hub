import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { linkBillingRequestAttachments } from "../src/lib/billingRequestAttachments";
import { paymentTypeLabel } from "../src/lib/financePaymentLabels";
const db = new PrismaClient();
async function main() {
  assert.match((process.env.DATABASE_URL || "").replaceAll("\\", "/"), /\/backups\/finance-payee-[^/]+\/engine\.db$/);
  const before = await db.financeAttachment.count();
  const rollback = new Error("ROLLBACK_TEST");
  try {
    await db.$transaction(async tx => {
      const prefix = crypto.randomUUID();
      const user = "TEST-A";
      const request = `TEST-BR-${prefix}`;
      const local = `/uploads/TEST-${prefix}.png`;
      await tx.financeAttachment.create({ data: { entityType: "BILLING_STAGED", entityId: user, attachmentType: "CUSTOMER_AMOUNT_CONFIRMATION", fileUrl: local, uploadedById: user } });
      await linkBillingRequestAttachments(tx,user,request);
      await assert.rejects(linkBillingRequestAttachments(tx,user,request,["http://example.com/image.png"]), /HTTPS/);
      await assert.rejects(linkBillingRequestAttachments(tx,user,request,["javascript:alert(1)"]), /HTTPS/);
      await assert.rejects(linkBillingRequestAttachments(tx,"TEST-B",request,[local]), /不属于/);
      assert.equal((await tx.financeAttachment.findFirstOrThrow({ where: { fileUrl: local } })).entityType,"BILLING_STAGED");
      await linkBillingRequestAttachments(tx,user,request,[local,local,"https://example.com/confirmation.png"]);
      const files = await tx.financeAttachment.findMany({ where: { entityId: request } });
      assert.equal(files.length,2);
      assert.ok(files.every(file => file.entityType === "BILLING_REQUEST" && file.attachmentType === "CUSTOMER_AMOUNT_CONFIRMATION"));
      await assert.rejects(linkBillingRequestAttachments(tx,user,"OTHER",[local]), /不属于/);
      throw rollback;
    });
  } catch(error) { if(error !== rollback) throw error; }
  assert.equal(await db.financeAttachment.count(),before);
  assert.equal(paymentTypeLabel("AFFILIATE"),"联盟商固费付款");
  assert.equal(paymentTypeLabel("CHANNEL"),"渠道商付款");
  assert.equal(paymentTypeLabel("SUPPLIER"),"公司采购付款");
  assert.equal(paymentTypeLabel("TAX"),"税费");
  console.log("Billing attachment storage/ownership/deduplication and payment label tests passed; fixtures rolled back.");
}
main().finally(()=>db.$disconnect());
