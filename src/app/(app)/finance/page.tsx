import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { purgeExpiredTrashedReconciliations } from "@/lib/reconciliationTrash";
import {
  reconciliationScope,
  channelReconciliationScope,
  customerScope,
  isStaff,
  parseViewScope,
} from "@/lib/dataScope";
import { FinanceClient } from "./FinanceClient";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const view = parseViewScope(sp);

  // 懒清理：仅内部员工触发
  if (isStaff(session.role)) {
    await purgeExpiredTrashedReconciliations();
  }

  const sess = {
    userId: session.userId,
    role: session.role,
    brandName: session.brandName,
  };
  const recScope = reconciliationScope(sess, view);
  const chRecScope = channelReconciliationScope(sess, view);
  const custScope = customerScope(sess, view);

  const [reconciliations, trashedReconciliations, channelReconciliations, customers, channelUsers, allUsers, affiliateReconciliations] = await Promise.all([
    // 未删除的对账记录（带行级权限）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.customerReconciliation.findMany({
      where: { AND: [{ deletedAt: null }, recScope as any] },
      include: {
        customer: {
          select: {
            id: true,
            brandName: true,
            businessOwner: { select: { id: true, name: true } },
          },
        },
        contract: { select: { id: true, contractNo: true, type: true } },
        createdBy: { select: { id: true, name: true } },
        settlements: {
          select: { id: true, type: true, amount: true, status: true },
        },
      },
      orderBy: { periodStart: "desc" },
    }),

    // 已软删除的对账记录（用于"已删除"Tab，带行级权限）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.customerReconciliation.findMany({
      where: { AND: [{ deletedAt: { not: null } }, recScope as any] },
      include: {
        customer: {
          select: {
            id: true,
            brandName: true,
          },
        },
        contract: { select: { id: true, contractNo: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { deletedAt: "desc" },
    }),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.channelReconciliation.findMany({
      where: chRecScope as any,
      include: {
        customer: { select: { id: true, brandName: true } },
        contract: { select: { id: true, contractNo: true } },
        customerReconciliation: {
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
            status: true,
            feeAmount: true,
            commissionAmount: true,
            finalCommissionAmount: true,
            settlements: {
              select: { id: true, type: true, status: true, actualDate: true },
            },
          },
        },
        channelUser: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        periods: { orderBy: { periodIndex: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // 有已签署完成合同的客户列表（用于新建对账，带行级权限）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.customer.findMany({
      where: {
        AND: [
          { contracts: { some: { status: "COMPLETED" } } },
          custScope as any,
        ],
      },
      select: {
        id: true,
        brandName: true,
        businessOwnerId: true,
        contactPhone: true,
        contracts: {
          where: { status: "COMPLETED" },
          select: {
            id: true,
            contractNo: true,
            type: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { brandName: "asc" },
    }),

    prisma.user.findMany({
      where: { role: "CHANNEL" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),

    // 所有用户（用于新建对账时选择负责人，需带邮箱）
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),

    // 联盟商对账记录
    prisma.affiliateReconciliation.findMany({
      include: {
        submitter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // 为渠道商新建分账查询：已确认的客户对账记录（按客户分组，带行级权限）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const confirmedCustomerReconciliations =
    await prisma.customerReconciliation.findMany({
      where: {
        AND: [
          { status: "CONFIRMED", deletedAt: null },
          recScope as any,
        ],
      },
      select: {
        id: true,
        customerId: true,
        contractId: true,
        periodStart: true,
        periodEnd: true,
        feeAmount: true,
        commissionAmount: true,
        finalCommissionAmount: true,
        fixedFeeCurrency: true,
        commissionCurrency: true,
        customer: { select: { id: true, brandName: true } },
        contract: { select: { id: true, contractNo: true } },
        settlements: {
          select: {
            id: true,
            type: true,
            status: true,
            amount: true,
            actualDate: true,
          },
        },
      },
      orderBy: { periodStart: "desc" },
    });

  return (
    <FinanceClient
      reconciliations={reconciliations}
      trashedReconciliations={trashedReconciliations}
      channelReconciliations={channelReconciliations}
      customers={customers}
      channelUsers={channelUsers}
      allUsers={allUsers}
      currentUserId={session.userId}
      confirmedCustomerReconciliations={confirmedCustomerReconciliations}
      affiliateReconciliations={affiliateReconciliations}
      canToggleScope={isStaff(session.role)}
      currentView={view}
      isChannel={session.role === "CHANNEL"}
      canManageCustomerReconciliations={isStaff(session.role)}
      canCreateChannelReconciliations={isStaff(session.role)}
      canViewAffiliateReconciliations={isStaff(session.role)}
    />
  );
}
