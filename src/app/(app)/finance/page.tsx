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
import { resolveUserPermission } from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import type { PermLevel } from "@/lib/featurePermissions";
import { redirect } from "next/navigation";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const [customerPermission, channelPermission, affiliatePermission] =
    await Promise.all([
      resolveUserPermission(session.userId, "finance.customer_reconciliation"),
      resolveUserPermission(session.userId, "finance.channel_reconciliation"),
      resolveUserPermission(session.userId, "finance.affiliate_reconciliation"),
    ]);
  const can = (permission: PermLevel, required: PermLevel) =>
    hasPermissionLevel(permission, required);
  const canViewCustomer = can(customerPermission, "READ");
  const canEditCustomer = can(customerPermission, "EDIT");
  const canManageCustomer = can(customerPermission, "MANAGE");
  const canViewChannel = can(channelPermission, "READ");
  const canEditChannel = can(channelPermission, "EDIT");
  const canManageChannel = can(channelPermission, "MANAGE");
  const canViewAffiliate = can(affiliatePermission, "READ");
  const canEditAffiliate = can(affiliatePermission, "EDIT");
  const canManageAffiliate = can(affiliatePermission, "MANAGE");
  if (!canViewCustomer && !canViewChannel && !canViewAffiliate) {
    redirect("/dashboard");
  }
  const sp = await searchParams;
  const view = parseViewScope(sp);

  // 懒清理：仅内部员工触发
  if (isStaff(session.role) && canManageCustomer) {
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
    canViewCustomer ? prisma.customerReconciliation.findMany({
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
    }) : Promise.resolve([]),

    // 已软删除的对账记录（用于"已删除"Tab，带行级权限）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canManageCustomer ? prisma.customerReconciliation.findMany({
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
    }) : Promise.resolve([]),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canViewChannel ? prisma.channelReconciliation.findMany({
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
    }) : Promise.resolve([]),

    // 有已签署完成合同的客户列表（用于新建对账，带行级权限）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canEditCustomer ? prisma.customer.findMany({
      where: {
        AND: [
          {
            deletedAt: null,
            contracts: { some: { status: "COMPLETED", deletedAt: null } },
          },
          custScope as any,
        ],
      },
      select: {
        id: true,
        brandName: true,
        businessOwnerId: true,
        contactPhone: true,
        contracts: {
          where: { status: "COMPLETED", deletedAt: null },
          select: {
            id: true,
            contractNo: true,
            type: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { brandName: "asc" },
    }) : Promise.resolve([]),

    canEditChannel ? prisma.user.findMany({
      where: { role: "CHANNEL", status: "APPROVED" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }) : Promise.resolve([]),

    // 所有用户（用于新建对账时选择负责人，需带邮箱）
    canEditCustomer ? prisma.user.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }) : Promise.resolve([]),

    // 联盟商对账记录
    canViewAffiliate ? prisma.affiliateReconciliation.findMany({
      include: {
        submitter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve([]),
  ]);

  // 为渠道商新建分账查询：已确认的客户对账记录（按客户分组，带行级权限）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const confirmedCustomerReconciliations = canEditChannel
    ? await prisma.customerReconciliation.findMany({
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
    })
    : [];

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
      canViewCustomerReconciliations={canViewCustomer}
      canEditCustomerReconciliations={canEditCustomer}
      canManageCustomerReconciliations={canManageCustomer}
      canViewChannelReconciliations={canViewChannel}
      canEditChannelReconciliations={canEditChannel}
      canManageChannelReconciliations={canManageChannel}
      canViewAffiliateReconciliations={canViewAffiliate}
      canEditAffiliateReconciliations={canEditAffiliate}
      canManageAffiliateReconciliations={canManageAffiliate}
    />
  );
}
