const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const customers = await p.customer.findMany({
    include: {
      contracts: { where: { status: "COMPLETED" } },
    },
    take: 10,
  });
  console.log("=== CUSTOMERS WITH COMPLETED CONTRACTS ===");
  customers.forEach((c) => {
    if (c.contracts.length > 0) {
      console.log(`Customer: ${c.id} | ${c.brandName}`);
      c.contracts.forEach((con) => {
        console.log(`  Contract: ${con.id} | ${con.contractNo} | feeAmount=${con.feeAmount} | commissionRate=${con.commissionRate} | feeCycle=${con.feeCycle} | partyA=${con.partyA}`);
      });
    }
  });

  const users = await p.user.findMany({ select: { id: true, name: true, role: true } });
  console.log("\n=== USERS ===");
  users.forEach((u) => console.log(`${u.id} | ${u.name} | ${u.role}`));

  const salesSummary = await p.salesRecord.groupBy({
    by: ["customerId"],
    _sum: { orders: true, revenue: true },
    _count: { id: true },
    where: { customerId: { not: null } },
    orderBy: { _sum: { revenue: "desc" } },
    take: 5,
  });
  console.log("\n=== SALES SUMMARY BY CUSTOMER ===");
  salesSummary.forEach((s) => {
    console.log(`customerId=${s.customerId} | records=${s._count.id} | orders=${s._sum.orders} | revenue=${s._sum.revenue}`);
  });

  await p.$disconnect();
}
main().catch(console.error);
