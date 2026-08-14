import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { purgeExpiredTrashedReconciliations } from "@/lib/reconciliationTrash";
import {
  reconciliationScope,
  channelReconciliationScope,
  financeReferenceCustomerScope,
  isStaff,
} from "@/lib/dataScope";
import { FinanceClient } from "./FinanceClient";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import type { PermLevel } from "@/lib/featurePermissions";
import { redirect } from "next/navigation";

function toShanghaiDateString(value: Date | null): string | null {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function FinancePage() {
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
  const canWriteChannel = canEditChannel && isStaff(session.role);
  const canViewAffiliate = isStaff(session.role) && can(affiliatePermission, "READ");
  const canEditAffiliate = isStaff(session.role) && can(affiliatePermission, "EDIT");
  const canManageAffiliate = isStaff(session.role) && can(affiliatePermission, "MANAGE");
  if (!canViewCustomer && !canViewChannel && !canViewAffiliate) {
    redirect("/dashboard");
  }
  // 懒清理：仅内部员工触发
  if (isStaff(session.role) && canManageCustomer) {
    await purgeExpiredTrashedReconciliations();
  }

  const sess = {
    userId: session.userId,
    role: session.role,
    brandName: session.brandName,
  };
  // 读操作（列表页）：内部员工（ADMIN/USER）全量可见；外部角色仍由 scope 硬隔离
  const recScope = reconciliationScope(sess, canViewCustomer && isStaff(sess.role) ? "all" : "mine");
  const chRecScope = channelReconciliationScope(sess, canViewChannel && isStaff(sess.role) ? "all" : "mine");
  const customerRecCustomerScope = financeReferenceCustomerScope(sess);
  const channelCustomerScope = financeReferenceCustomerScope(sess);

  const [reconciliations, trashedReconciliations, channelReconciliations, customers, channelUsers, affiliateReconciliations] = await Promise.all([
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
      where: { AND: [{ deletedAt: null }, chRecScope as any] },
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
           customerRecCustomerScope as any,
        ],
      },
      select: {
        id: true,
        brandName: true,
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

    canWriteChannel ? prisma.user.findMany({
      where: { role: "CHANNEL", status: "APPROVED" },
      select: { id: true, name: true },
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
  // New channel reconciliation records are driven by customer configuration,
  // not by a contract or a confirmed monthly customer reconciliation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelCustomerRows = canWriteChannel
    ? await prisma.customer.findMany({
        where: {
          AND: [
            { deletedAt: null, channelUserId: { not: null } },
            channelCustomerScope as any,
          ],
        },
        select: {
          id: true,
          brandName: true,
          channelUserId: true,
          splitRules: { where: { contractId: null }, take: 1 },
          contracts: {
            where: { status: "COMPLETED", deletedAt: null },
            select: {
              id: true,
              contractNo: true,
              startDate: true,
              endDate: true,
              feeCurrency: true,
              splitRule: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { brandName: "asc" },
      })
    : [];
  const channelUserIds = [
    ...new Set(
      channelCustomerRows
        .map((row) => row.channelUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const activeChannelUsers = channelUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: channelUserIds }, role: "CHANNEL", status: "APPROVED" },
        select: { id: true, name: true },
      })
    : [];
  const channelUserMap = new Map(activeChannelUsers.map((user) => [user.id, user]));
  const channelReconciliationCustomers = channelCustomerRows.map((row) => ({
    id: row.id,
    brandName: row.brandName,
    channelUser: row.channelUserId ? channelUserMap.get(row.channelUserId) ?? null : null,
    contracts: row.contracts.map((contract) => ({
      id: contract.id,
      contractNo: contract.contractNo,
      startDate: toShanghaiDateString(contract.startDate),
      endDate: toShanghaiDateString(contract.endDate),
      feeCurrency: contract.feeCurrency,
      splitRule: contract.splitRule ? {
        id: contract.splitRule.id,
        ruleType: contract.splitRule.ruleType as "A" | "B",
        splitEndDate: toShanghaiDateString(contract.splitRule.splitEndDate)!,
        fixedFeeRate: contract.splitRule.fixedFeeRate,
        commissionThresholdAmount: contract.splitRule.commissionThresholdAmount,
        commissionThresholdCurrency: contract.splitRule.commissionThresholdCurrency,
        commissionBelowRate: contract.splitRule.commissionBelowRate,
        commissionAtOrAboveRate: contract.splitRule.commissionAtOrAboveRate,
      } : null,
    })),
    splitRule: row.splitRules[0]
      ? {
          id: row.splitRules[0].id,
          ruleType: row.splitRules[0].ruleType as "A" | "B",
          splitEndDate: toShanghaiDateString(row.splitRules[0].splitEndDate)!,
          fixedFeeRate: row.splitRules[0].fixedFeeRate,
          commissionThresholdAmount: row.splitRules[0].commissionThresholdAmount,
          commissionThresholdCurrency: row.splitRules[0].commissionThresholdCurrency,
          commissionBelowRate: row.splitRules[0].commissionBelowRate,
          commissionAtOrAboveRate: row.splitRules[0].commissionAtOrAboveRate,
        }
      : null,
  }));

  return (
    <FinanceClient
      reconciliations={reconciliations}
      trashedReconciliations={trashedReconciliations}
      channelReconciliations={channelReconciliations}
      customers={customers}
      channelUsers={channelUsers}
      channelReconciliationCustomers={channelReconciliationCustomers}
      affiliateReconciliations={affiliateReconciliations}
      canToggleScope={false}
      currentView="all"
      isChannel={session.role === "CHANNEL"}
      canViewCustomerReconciliations={canViewCustomer}
      canEditCustomerReconciliations={canEditCustomer}
      canManageCustomerReconciliations={canManageCustomer}
      canViewChannelReconciliations={canViewChannel}
      canEditChannelReconciliations={canWriteChannel}
      canManageChannelReconciliations={canManageChannel}
      canCreateChannelReconciliations={canWriteChannel}
      canViewAffiliateReconciliations={canViewAffiliate}
      canEditAffiliateReconciliations={canEditAffiliate}
      canManageAffiliateReconciliations={canManageAffiliate}
    />
  );
}
