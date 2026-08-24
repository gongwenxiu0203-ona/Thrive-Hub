import { PrismaClient } from "@prisma/client";
import { releaseExistingReceiptAllocation } from "../src/lib/financeWorkflow";

const prisma = new PrismaClient();
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.split("=", 2);
    return [key, value];
  }),
);

async function main() {
  const allocationId = args.get("--allocation-id");
  const apply = args.has("--apply");
  if (!allocationId) throw new Error("请提供 --allocation-id=<核销分配ID>");
  const allocation = await prisma.customerReceiptAllocation.findUnique({
    where: { id: allocationId },
    include: {
      receipt: { select: { receiptNo: true, customerId: true, currency: true } },
      reconciliation: { select: { id: true, reconcileType: true, contractId: true } },
      payableSources: true,
    },
  });
  if (!allocation) throw new Error("核销分配不存在");
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", allocation }, null, 2));
  if (!apply) return;
  const result = await releaseExistingReceiptAllocation(allocation.id, allocation.createdById);
  console.log(JSON.stringify({ result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
