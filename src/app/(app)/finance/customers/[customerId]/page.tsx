import { notFound } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { CustomerReconciliationDetailClient } from "./CustomerReconciliationDetailClient";
import { getReconciliationAccess } from "@/lib/reconciliationAccess";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { getReconciliationInvoiceStateMap } from "@/lib/reconciliationInvoice";
import { ensureCustomerPlansForCooperatingCustomer } from "@/lib/customerReconciliationPlan";
import { confirmationDraftSchema } from "@/lib/contractConfirmationDraft";

function accountLabel(snapshot: string) {
  try {
    const account = JSON.parse(snapshot) as {
      name?: string;
      accountName?: string;
      legalEntity?: string;
      bankName?: string;
      accountNumber?: string;
    };
    const owner = account.accountName || account.legalEntity || account.name || "乙方收款账户";
    const bank = account.bankName ? ` · ${account.bankName}` : "";
    const tail = account.accountNumber ? ` · ${account.accountNumber.slice(-4)}` : "";
    return `${owner}${bank}${tail}`;
  } catch {
    return "乙方收款账户";
  }
}

function confirmationAccountIds(details: string) {
  try {
    const parsed = JSON.parse(details) as { data?: { receivingAccountIds?: unknown } };
    return Array.isArray(parsed.data?.receivingAccountIds)
      ? parsed.data.receivingAccountIds.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function confirmationDraft(details: string) {
  try {
    const parsed = JSON.parse(details) as { schemaVersion?: number; data?: unknown };
    if (parsed.schemaVersion !== 1) return null;
    const result = confirmationDraftSchema.safeParse(parsed.data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export default async function CustomerReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ contractId?: string }>;
}) {
  const session = await requireSession();
  const access = await getReconciliationAccess(session, "READ", undefined, true);
  const canEdit = hasPermissionLevel(access.permission, "EDIT");
  const canManage = hasPermissionLevel(access.permission, "MANAGE");
  const { customerId } = await params;
  const sp = await searchParams;

  const accessibleCustomer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null, ...access.customerScope },
    select: { id: true, status: true },
  });
  if (!accessibleCustomer) notFound();
  if (canEdit && accessibleCustomer.status === "COOPERATING") {
    await ensureCustomerPlansForCooperatingCustomer(customerId, session.userId);
  }

  const [customer, reconciliations, users, linkableInvoices] = await Promise.all([
    // 客户基本信息 + 合同 + 联系人
    prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null, ...access.customerScope },
      include: {
        businessOwner: { select: { id: true, name: true, email: true } },
        contracts: {
          where: { status: { in: ["COMPLETED", "TERMINATED"] }, deletedAt: null },
          select: {
            id: true,
            contractNo: true,
            contractMode: true,
            projectConfirmations: {
              where: { status: { in: ["EFFECTIVE", "TERMINATED"] } },
              select: { id: true, number: true, title: true, details: true, startDate: true, endDate: true },
              orderBy: { createdAt: "asc" },
            },
            receivingAccounts: {
              select: { id: true, financeProfileId: true, snapshot: true },
              orderBy: { position: "asc" },
            },
            partyA: true,
            partyAContact: true,
            partyAEmail: true,
            partyAPhone: true,
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
      where: { AND: [{ customerId, deletedAt: null, planStatus: { not: "CANCELLED" } }, access.scope] },
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

      },
      orderBy: { periodStart: "desc" },
    }),

    // 所有用户（用于「提交给」选择器）
    canEdit ? prisma.user.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }) : Promise.resolve([]),
    canEdit ? prisma.invoice.findMany({
      where: { customerId, status: "ISSUED", deletedAt: null },
      select: {
        id: true, invoiceNo: true, documentType: true, contractId: true,
        contractLinks: { select: { contractId: true } },
      },
      orderBy: { invoiceDate: "desc" },
    }) : Promise.resolve([]),
  ]);

  const invoiceStates = await getReconciliationInvoiceStateMap(
    prisma,
    reconciliations.map((record) => record.id),
  );

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
    : customer.contracts.length === 1
      ? customer.contracts[0]
      : null;

  const customerForClient = {
    ...customer,
    contracts: customer.contracts.map((item) => {
      const accounts = item.receivingAccounts.map((account) => ({
        id: account.financeProfileId || account.id,
        label: accountLabel(account.snapshot),
      }));
      return {
        ...item,
        receivingAccounts: accounts,
        projectConfirmations: item.projectConfirmations.map((confirmation) => {
          const selectedIds = new Set(confirmationAccountIds(confirmation.details));
          return {
            ...confirmation,
            draft: confirmationDraft(confirmation.details),
            receivingAccounts: accounts.filter((account) => selectedIds.has(account.id)),
          };
        }),
      };
    }),
  };
  const contractForClient = contract
    ? customerForClient.contracts.find((item) => item.id === contract.id) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <BackButton label="返回财务对账" fallbackHref="/finance" />
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {customer.brandName} — 对账管理
        </h1>
        <p className="text-sm text-slate-500">
          {contract ? `合同：${contract.contractNo}` : `共 ${customer.contracts.length} 份有效合同，可在下方切换查看`}
        </p>
      </div>

      <CustomerReconciliationDetailClient
        customer={customerForClient}
        contract={contractForClient}
        reconciliations={reconciliations}
        currentUserId={session.userId}
        users={users}
        readOnly={!canEdit}
        canManage={canManage}
        invoiceStates={invoiceStates}
        linkableInvoices={linkableInvoices.map((invoice) => ({
          id: invoice.id,
          invoiceNo: invoice.invoiceNo,
          documentType: invoice.documentType,
          contractIds: Array.from(new Set([invoice.contractId, ...invoice.contractLinks.map((link) => link.contractId)].filter((id): id is string => Boolean(id)))),
        }))}
      />
    </div>
  );
}
