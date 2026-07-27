import { notFound } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { CustomerReconciliationDetailClient } from "./CustomerReconciliationDetailClient";
import { getReconciliationAccess } from "@/lib/reconciliationAccess";
import { hasPermissionLevel } from "@/lib/permissionGuard";

export default async function CustomerReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ contractId?: string }>;
}) {
  const session = await requireSession();
  const access = await getReconciliationAccess(session, "READ");
  const canEdit = hasPermissionLevel(access.permission, "EDIT");
  const canManage = hasPermissionLevel(access.permission, "MANAGE");
  const { customerId } = await params;
  const sp = await searchParams;

  const [customer, reconciliations, users] = await Promise.all([
    // 客户基本信息 + 合同 + 联系人
    prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null, ...access.customerScope },
      include: {
        businessOwner: { select: { id: true, name: true, email: true } },
        contracts: {
          where: { status: "COMPLETED", deletedAt: null },
          select: {
            id: true,
            contractNo: true,
            partyA: true,
            // v3 字段
            promoPlatform: true,
            targetSite: true,
            feeAmount: true,
            feeCurrency: true,
            paymentMethod: true,
            commissionType: true,
            commissionRate: true,
            thresholdAmount: true,
            thresholdCurrency: true,
            tieredRules: true,
            excessBaseMonths: true,
            excessCommissionRate: true,
            gmvSettlementCycle: true,
            // 兼容旧字段
            feeCycle: true,
            hasBet: true,
            betTarget: true,
            betTargetCurrency: true,
            affiliateRule: true,
            accountingPeriod: true,
            paymentCycle: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),

    // 所有未删除的月度对账记录（新→旧）
    prisma.customerReconciliation.findMany({
      where: { AND: [{ customerId, deletedAt: null }, access.scope] },
      include: {
        contract: {
          select: {
            id: true,
            contractNo: true,
            // v3 字段用于抽佣计算
            commissionType: true,
            commissionRate: true,
            thresholdAmount: true,
            thresholdCurrency: true,
            tieredRules: true,
            excessBaseMonths: true,
            excessCommissionRate: true,
            gmvSettlementCycle: true,
          },
        },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        submittedToUser: { select: { id: true, name: true } },
        reviews: {
          include: { reviewer: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        settlements: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { type: "asc" },
        },
      },
      orderBy: { periodStart: "desc" },
    }),

    // 所有用户（用于「提交给」选择器）
    canEdit ? prisma.user.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }) : Promise.resolve([]),
  ]);

  if (!customer) notFound();

  // 行级权限校验
  if (session.role === "BRAND" && session.brandName) {
    if (customer.brandName !== session.brandName) notFound();
  } else if (session.role === "CHANNEL") {
    if (
      customer.channelUserId !== session.userId &&
      customer.createdById !== session.userId
    ) {
      notFound();
    }
  }

  // 选择合同：优先用户指定的 contractId（来自查询参数），否则取最新一个
  const contract = sp.contractId
    ? customer.contracts.find((c) => c.id === sp.contractId) ??
      customer.contracts[0] ??
      null
    : customer.contracts[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <BackButton label="返回财务对账" fallbackHref="/finance" />
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {customer.brandName} — 对账管理
        </h1>
        {contract && (
          <p className="text-sm text-slate-500">合同：{contract.contractNo}</p>
        )}
      </div>

      <CustomerReconciliationDetailClient
        customer={customer}
        contract={contract}
        reconciliations={reconciliations}
        currentUserId={session.userId}
        users={users}
        readOnly={!canEdit}
        canManage={canManage}
      />
    </div>
  );
}
