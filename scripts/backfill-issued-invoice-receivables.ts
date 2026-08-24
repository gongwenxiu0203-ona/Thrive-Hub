import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: { status: "ISSUED", deletedAt: null, accountsReceivableId: null },
    select: {
      id: true,
      invoiceNo: true,
      customerId: true,
      invoiceDate: true,
      dueDate: true,
      totalAmount: true,
      currency: true,
    },
  });

  let linked = 0;
  let created = 0;
  for (const invoice of invoices) {
    await prisma.$transaction(async (tx) => {
      const normalizedCurrency = invoice.currency === "CNY" ? "RMB" : invoice.currency;
      if (normalizedCurrency === "MIXED") {
        throw new Error(`Invoice ${invoice.invoiceNo} 为混合币种，不能自动创建单一应收。`);
      }
      const exchangeRate = normalizedCurrency === "USD" ? 7.2 : 1;
      let receivable = await tx.accountsReceivable.findUnique({
        where: { invoiceNo: invoice.invoiceNo },
      });
      if (receivable) {
        if (
          receivable.customerId !== invoice.customerId ||
          receivable.currency !== normalizedCurrency ||
          Math.abs(receivable.invoiceAmount - invoice.totalAmount) > 0.01
        ) {
          throw new Error(`Invoice ${invoice.invoiceNo} 已有同号但金额、币种或客户不一致的应收。`);
        }
      } else {
        const overdue = invoice.dueDate < new Date();
        receivable = await tx.accountsReceivable.create({
          data: {
            customerId: invoice.customerId,
            invoiceNo: invoice.invoiceNo,
            invoiceDate: invoice.invoiceDate,
            invoiceAmount: invoice.totalAmount,
            currency: normalizedCurrency,
            exchangeRate,
            amountRmb: roundMoney(invoice.totalAmount * exchangeRate),
            dueDate: invoice.dueDate,
            status: overdue ? "OVERDUE" : "NOT_DUE",
            riskLevel: overdue ? "YELLOW" : "GREEN",
          },
        });
        created += 1;
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { accountsReceivableId: receivable.id },
      });
      linked += 1;
    });
  }
  console.log(`backfill complete: scanned=${invoices.length}, created=${created}, linked=${linked}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
