import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createPayeeSnapshot, financePayeeDetails } from "../src/lib/financePayee";

const prisma = new PrismaClient();
const rollback = new Error("TEST_ROLLBACK");
async function main() {
  assert.match((process.env.DATABASE_URL || "").replaceAll("\\", "/"), /\/backups\/finance-payee-[^/]+\/engine\.db$/, "Run only against the isolated finance-payee preview copy");
  const actor = await prisma.user.findFirst({ select: { id: true } });
  assert.ok(actor, "Test requires an existing user in an isolated copy");
  const counts = [await prisma.financeAccountProfile.count(), await prisma.paymentRequest.count()];
  try {
    await prisma.$transaction(async tx => {
      const profile = await tx.financeAccountProfile.create({ data: {
        profileNo: `TEST-PAYEE-${crypto.randomUUID()}`, name: "TEST Affiliate", accountType: "AFFILIATE_PAYEE", legalEntity: "TEST Holder",
        accountName: "TEST Holder", bankName: "TEST Bank", accountNumber: "000012345", currency: "USD", country: "US",
        routingNumber: "001234567", bankAddress: "TEST bank address", payeeAddress: "TEST holder address 00001",
        accountHolderType: "business", bankAccountType: "Checking", accountHolderMobile: "+10000000000",
        accountHolderEmail: "test@example.com", note: "TEST note", createdById: actor.id,
      } });
      const request = await tx.paymentRequest.create({ data: {
        requestNo: `TEST-PAY-${crypto.randomUUID()}`, requestType: "AFFILIATE", applicantId: actor.id,
        payerEntity: "TEST payer", reason: "TEST snapshot", amount: 10, currency: "USD",
        payeeSnapshot: JSON.stringify(createPayeeSnapshot(profile)),
      } });
      const data = JSON.parse(request.payeeSnapshot);
      for (const key of ["country", "bankAddress", "payeeAddress", "routingNumber", "bankAccountType", "accountHolderType", "accountHolderMobile", "accountHolderEmail", "note"] as const) assert.equal(data[key], profile[key]);
      assert.equal(data.accountNumber, "000012345");
      await tx.financeAccountProfile.update({ where: { id: profile.id }, data: { accountHolderEmail: "changed@example.com", accountName: "Changed" } });
      const saved = await tx.paymentRequest.findUniqueOrThrow({ where: { id: request.id } });
      assert.equal(saved.payeeSnapshot, request.payeeSnapshot);
      assert.ok(financePayeeDetails(saved.payeeSnapshot).some(field => field.value === "test@example.com"));
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  assert.deepEqual([await prisma.financeAccountProfile.count(), await prisma.paymentRequest.count()], counts);
  console.log("Finance payee storage and immutable snapshot tests passed; all fixtures rolled back.");
}
main().finally(() => prisma.$disconnect());
