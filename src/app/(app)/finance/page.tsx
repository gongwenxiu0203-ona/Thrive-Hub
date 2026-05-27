import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { FinanceClient } from "./FinanceClient";

export default async function FinancePage() {
  await requireSession();

  const [reconciliations, channelReconciliations, customers, channelUsers] = await Promise.all([
    prisma.customerReconciliation.findMany({
      include: {
        customer: { select: { id: true, brandName: true } },
        contract: { select: { id: true, contractNo: true, type: true } },
        createdBy: { select: { id: true, name: true } },
        settlements: {
          select: {
            id: true,
            type: true,
            amount: true,
            status: true,
            estimatedDate: true,
            actualDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.channelReconciliation.findMany({
      include: {
        customer: { select: { id: true, brandName: true } },
        channelUser: { select: { id: true, name: true } },
        settlement: { select: { id: true, type: true, amount: true, status: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // 有已签署完成合同的客户列表（用于新建对账）
    prisma.customer.findMany({
      where: {
        contracts: { some: { status: "COMPLETED" } },
      },
      include: {
        contracts: {
          where: { status: "COMPLETED" },
          select: {
            id: true,
            contractNo: true,
            type: true,
            partyA: true,
            feeAmount: true,
            commissionRate: true,
            feeCycle: true,
            accountingPeriod: true,
            affiliateRule: true,
            paymentCycle: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { brandName: "asc" },
    }),
    // 渠道商用户列表
    prisma.user.findMany({
      where: { role: "CHANNEL" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <FinanceClient
      reconciliations={reconciliations}
      channelReconciliations={channelReconciliations}
      customers={customers}
      channelUsers={channelUsers}
    />
  );
}
