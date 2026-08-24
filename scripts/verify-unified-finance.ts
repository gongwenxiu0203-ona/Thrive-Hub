import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const integrity = await prisma.$queryRawUnsafe<Array<{ integrity_check: string }>>("PRAGMA integrity_check");
  const foreignKeys = await prisma.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check");
  const [profiles, manualItems, suppliers, payments, expenses] = await Promise.all([
    prisma.customerBillingProfile.count(),
    prisma.manualBillingRequestItem.count(),
    prisma.supplier.count(),
    prisma.paymentRequest.count(),
    prisma.expenseClaim.count(),
  ]);
  console.log(JSON.stringify({ integrity, foreignKeyErrors: foreignKeys.length, tablesReadable: { profiles, manualItems, suppliers, payments, expenses } }, null, 2));
}

main().finally(() => prisma.$disconnect());
