import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { isStaff } from "@/lib/permissions";
import { FinanceWorkbenchClient } from "./FinanceWorkbenchClient";
import { FinanceFlowHub, type ProfileCategory } from "./FinanceFlowHub";
import { UnifiedFinancePanel } from "./UnifiedFinancePanel";
import { FinanceWorkspaceSections } from "./FinanceWorkspaceSections";
import {
  INVOICE_BANK_ACCOUNTS,
  invoiceBankAccountForKey,
} from "@/lib/invoiceBankAccounts";

export const dynamic = "force-dynamic";
export const metadata = { title: "财务工作台 · Thraive" };

function auditMetadata(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed))
      return parsed
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean);
  } catch {
    // Legacy contract values are commonly comma-separated strings.
  }
  return value
    .split(/[,，、;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function contractInvoiceAccounts(value: string | null | undefined) {
  const linked = parseStringList(value)
    .map(invoiceBankAccountForKey)
    .filter(
      (account): account is NonNullable<typeof account> => Boolean(account),
    );
  return linked.length ? linked : Object.values(INVOICE_BANK_ACCOUNTS);
}

export default async function FinanceWorkbenchPage() {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/finance");
  const [invoicePermission, receivablePermission, channelPermission, paymentPermission, expensePermission, profilePermission] =
    await Promise.all([
      resolveUserPermission(session.userId, "finance.billing_requests"),
      resolveUserPermission(session.userId, "finance.receivables"),
      resolveUserPermission(session.userId, "finance.channel_reconciliation"),
      resolveUserPermission(session.userId, "finance.payment_requests"),
      resolveUserPermission(session.userId, "finance.expenses"),
      resolveUserPermission(session.userId, "finance.profiles"),
    ]);
  const canViewBilling =
    hasPermissionLevel(invoicePermission, "READ") ||
    hasPermissionLevel(receivablePermission, "READ");
  const canViewChannel = hasPermissionLevel(channelPermission, "READ") || hasPermissionLevel(paymentPermission, "READ") || hasPermissionLevel(expensePermission, "READ");
  const canManageBilling = hasPermissionLevel(invoicePermission, "MANAGE");
  if (!canViewBilling && !canViewChannel) redirect("/finance");
  const [
    billingRequests,
    receivables,
    receipts,
    channelPeriods,
    payableExceptions,
  ] = await Promise.all([
    canViewBilling
      ? prisma.billingRequest.findMany({
          where: { status: { not: "CANCELLED" } },
          include: {
            customer: { select: { brandName: true } },
            applicant: { select: { id: true, name: true } },
            lines: {
              select: {
                id: true,
                reconciliation: {
                  select: {
                    contract: { select: { contractNo: true } },
                  },
                },
              },
            },
            manualItems: { select: { id: true } },
            invoices: {
              where: { deletedAt: null },
              select: {
                id: true,
                invoiceNo: true,
                status: true,
                totalAmount: true,
                billingAllocations: { select: { amount: true } },
                domesticDocument: {
                  select: { invoiceNumber: true, originalFileUrl: true },
                },
              },
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { submittedAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),
    canViewBilling
      ? prisma.accountsReceivable.findMany({
          where: {
            status: { in: ["NOT_DUE", "PARTIAL", "OVERDUE"] },
            invoices: { some: { deletedAt: null } },
          },
          include: {
            customer: { select: { brandName: true } },
            invoices: {
              where: { deletedAt: null },
              select: {
                id: true,
                invoiceNo: true,
                domesticDocument: {
                  select: { invoiceNumber: true, originalFileUrl: true },
                },
              },
              take: 1,
            },
          },
          orderBy: { dueDate: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
    canViewBilling
      ? prisma.customerReceipt.findMany({
          where: { status: { in: ["UNALLOCATED", "PARTIAL"] } },
          include: {
            customer: { select: { brandName: true } },
            allocations: {
              where: { status: "ACTIVE" },
              select: { allocatedAmount: true },
            },
          },
          orderBy: { receivedAt: "asc" },
          take: 100,
        })
      : Promise.resolve([]),
    canViewChannel
      ? prisma.channelReconciliationPeriod.findMany({
          where: {
            payableStatus: {
              in: [
                "ELIGIBLE",
                "WAITING_FINANCE_REVIEW",
                "DOCUMENT_REJECTED",
                "WAITING_PAYMENT",
                "PARTIALLY_PAID",
              ],
            },
          },
          include: {
            reconciliation: {
              include: {
                customer: { select: { brandName: true } },
                channelUser: { select: { name: true } },
              },
            },
            payments: { where: { status: "PAID" } },
          },
          orderBy: { updatedAt: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
    canViewChannel
      ? prisma.financeAuditLog.findMany({
          where: {
            entityType: "CHANNEL_PAYABLE_EXCEPTION",
            action: "AUTO_RELEASE_FAILED",
          },
          select: {
            id: true,
            entityId: true,
            note: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);
  const exceptionMetadata = payableExceptions.map((row) => ({
    row,
    metadata: auditMetadata(row.metadata),
  }));
  const exceptionReconciliationIds = [
    ...new Set(
      exceptionMetadata
        .map(({ row, metadata }) =>
          String(
            metadata.reconciliationId ??
              metadata.customerReconciliationId ??
              row.entityId,
          ),
        )
        .filter(Boolean),
    ),
  ];
  const exceptionReconciliations = exceptionReconciliationIds.length
    ? await prisma.customerReconciliation.findMany({
        where: { id: { in: exceptionReconciliationIds } },
        select: {
          id: true,
          customerId: true,
          periodStart: true,
          periodEnd: true,
          customer: { select: { brandName: true } },
        },
      })
    : [];
  const exceptionReconciliationMap = new Map(
    exceptionReconciliations.map((row) => [row.id, row]),
  );
  const [financeCustomers, paymentRequests, expenseClaims, financeUsers, financeAffiliates] =
    await Promise.all([
      prisma.customer.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          brandName: true,
          billingProfiles: {
            where: { status: "ACTIVE" },
            orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              name: true,
              invoiceTitle: true,
              taxNumber: true,
              registeredAddress: true,
              registeredPhone: true,
              bankName: true,
              bankAccount: true,
              deliveryEmail: true,
              isDefault: true,
            },
          },
          contracts: {
            where: { deletedAt: null },
            select: {
              id: true,
              contractNo: true,
              partyAAddress: true,
              promoPlatform: true,
              targetSite: true,
              coopChannels: true,
              partyBBankAccounts: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { brandName: "asc" },
      }),
      prisma.paymentRequest.findMany({
        where: {},
        include: { supplier: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.expenseClaim.findMany({
        where: {},
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.user.findMany({ select: { id: true, name: true, role: true } }),
      prisma.affiliate.findMany({
        where: { deletedAt: null },
        select: { id: true, platformAffiliateName: true, internalAffiliateName: true },
        orderBy: { platformAffiliateName: "asc" },
        take: 1000,
      }),
    ]);
  const financeUserMap = new Map(financeUsers.map((row) => [row.id, row.name]));
  const visibleBillingIds = billingRequests.map((row) => row.id);
  const visiblePaymentIds = paymentRequests.map((row) => row.id);
  const visibleExpenseIds = expenseClaims.map((row) => row.id);
  const [financeAccounts, approvalSteps] = await Promise.all([
    prisma.financeAccountProfile.findMany({
      where: { status: "ACTIVE" },
      orderBy: [
        { accountType: "asc" },
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
    }),
    prisma.financeApprovalStep.findMany({
      where: {
        OR: [
          {
            entityType: "BILLING_REQUEST",
            entityId: { in: visibleBillingIds },
          },
          {
            entityType: "PAYMENT_REQUEST",
            entityId: { in: visiblePaymentIds },
          },
          { entityType: "EXPENSE_CLAIM", entityId: { in: visibleExpenseIds } },
        ],
      },
      orderBy: { stepNo: "asc" },
    }),
  ]);
  const stepsFor = (entityType: string, entityId: string) =>
    approvalSteps
      .filter(
        (step) => step.entityType === entityType && step.entityId === entityId,
      )
      .map((step) => ({
        label: step.stepType === "SHALLOW_REVIEW" ? "Shallow 审核" : "财务处理",
        status: step.status as "PENDING" | "APPROVED" | "REJECTED",
        assignee: step.assigneeId
          ? financeUserMap.get(step.assigneeId)
          : undefined,
      }));
  const accountCategory = (value: string): ProfileCategory => {
    const type = value.toUpperCase();
    if (type.includes("CUSTOMER")) return "CUSTOMER_BILLING";
    if (type.includes("CHANNEL")) return "CHANNEL_PAYEE";
    if (type.includes("AFFILIATE")) return "AFFILIATE_PAYEE";
    if (type.includes("PERSON") || type.includes("EMPLOYEE"))
      return "EMPLOYEE_REIMBURSEMENT";
    if (type.includes("COMPANY")) return "COMPANY_PAYER";
    return "SUPPLIER_PAYEE";
  };
  return (
    <div className="space-y-6">
      <FinanceWorkspaceSections
        workbench={
          <FinanceWorkbenchClient
            canViewBilling={canViewBilling}
            canViewPayment={canViewChannel}
            canEditBilling={hasPermissionLevel(invoicePermission, "EDIT")}
            canEditReceipt={hasPermissionLevel(receivablePermission, "EDIT")}
            canEditPayment={hasPermissionLevel(paymentPermission, "EDIT") || hasPermissionLevel(channelPermission, "EDIT")}
            isAdmin={canManageBilling}
            billingRequests={billingRequests.map((row) => {
              const issuedAmount = row.invoices
                .filter((invoice) => invoice.status === "ISSUED")
                .reduce(
                  (sum, invoice) =>
                    sum +
                    (invoice.billingAllocations.length
                      ? invoice.billingAllocations.reduce(
                          (allocationSum, allocation) =>
                            allocationSum + allocation.amount,
                          0,
                        )
                      : invoice.totalAmount),
                  0,
                );
              return {
                id: row.id,
                requestNo: row.requestNo,
                customerName: row.customer.brandName,
                applicantName: row.applicant.name,
                documentType: row.documentType,
                mergeMode: row.mergeMode,
                lineCount: row.lines.length + row.manualItems.length,
                contractNos: Array.from(
                  new Set(
                    row.lines
                      .map((line) => line.reconciliation.contract.contractNo)
                      .filter(Boolean),
                  ),
                ),
                sourceType: row.sourceType,
                applicantNote: row.applicantNote,
                status:
                  row.status === "PROCESSING" && issuedAmount > 0
                    ? "PARTIAL"
                    : row.status,
                currency: row.currency,
                requestedAmount: row.requestedAmount,
                issuedAmount,
                submittedAt: row.submittedAt.toISOString(),
                invoice: row.invoices[0]
                  ? {
                      id: row.invoices[0].id,
                      invoiceNo: row.invoices[0].invoiceNo,
                      status: row.invoices[0].status,
                      totalAmount: row.invoices[0].totalAmount,
                      actualInvoiceNo:
                        row.invoices[0].domesticDocument?.invoiceNumber ?? null,
                      originalFileUrl:
                        row.invoices[0].domesticDocument?.originalFileUrl ??
                        null,
                    }
                  : null,
                documents: row.invoices
                  .filter(
                    (invoice) => invoice.status === "ISSUED"
                      && (row.documentType !== "DOMESTIC"
                        || Boolean(invoice.domesticDocument?.originalFileUrl)),
                  )
                  .map((invoice) => ({
                    id: invoice.id,
                    invoiceNo: invoice.invoiceNo,
                    status: invoice.status,
                    actualInvoiceNo:
                      invoice.domesticDocument?.invoiceNumber ?? null,
                    originalFileUrl:
                      invoice.domesticDocument?.originalFileUrl ?? null,
                  })),
              };
            })}
            receivables={receivables.map((row) => ({
              id: row.id,
              customerId: row.customerId,
              customerName: row.customer?.brandName ?? "未关联客户",
              invoiceNo: row.invoiceNo,
              actualInvoiceNo:
                row.invoices[0]?.domesticDocument?.invoiceNumber ??
                row.invoiceNo,
              invoiceId: row.invoices[0]?.id ?? null,
              originalFileUrl:
                row.invoices[0]?.domesticDocument?.originalFileUrl ?? null,
              currency: row.currency,
              invoiceAmount: row.invoiceAmount,
              receivedAmount: row.receivedAmount,
              balance: Math.max(0, row.invoiceAmount - row.receivedAmount),
              dueDate: row.dueDate.toISOString(),
              status: row.status,
            }))}
            unallocatedReceipts={receipts.map((row) => ({
              id: row.id,
              receiptNo: row.receiptNo,
              customerName: row.customer.brandName,
              currency: row.currency,
              amount: row.amount,
              allocated: row.allocations.reduce(
                (sum, item) => sum + item.allocatedAmount,
                0,
              ),
              receivedAt: row.receivedAt.toISOString(),
            }))}
            channelPeriods={channelPeriods.map((row) => ({
              id: row.id,
              reconciliationId: row.reconciliationId,
              customerName: row.reconciliation.customer?.brandName ?? "—",
              channelName: row.reconciliation.channelUser.name,
              periodLabel: row.periodLabel ?? `第 ${row.periodIndex} 期`,
              status: row.payableStatus,
              currency:
                row.fixedFeeReceivedCurrency ??
                row.commissionReceivedCurrency ??
                "USD",
              balance: Math.max(
                0,
                (row.fixedFeeShareAmount ?? 0) +
                  (row.commissionShareAmount ?? 0) -
                  row.payments.reduce((sum, item) => sum + item.amount, 0),
              ),
            }))}
            payableExceptions={exceptionMetadata.map(({ row, metadata }) => {
              const reconciliationId = String(
                metadata.reconciliationId ??
                  metadata.customerReconciliationId ??
                  row.entityId,
              );
              const reconciliation =
                exceptionReconciliationMap.get(reconciliationId);
              return {
                id: row.id,
                customerId:
                  reconciliation?.customerId ??
                  (typeof metadata.customerId === "string"
                    ? metadata.customerId
                    : null),
                customerName:
                  reconciliation?.customer.brandName ??
                  (typeof metadata.customerName === "string"
                    ? metadata.customerName
                    : "未识别客户"),
                reconciliationId:
                  reconciliation?.id ??
                  (typeof metadata.reconciliationId === "string"
                    ? metadata.reconciliationId
                    : null),
                reconciliationLabel: reconciliation
                  ? `${reconciliation.periodStart.toISOString().slice(0, 10)} ～ ${reconciliation.periodEnd.toISOString().slice(0, 10)}`
                  : typeof metadata.periodLabel === "string"
                    ? metadata.periodLabel
                    : row.entityId,
                reason:
                  row.note ??
                  (typeof metadata.reason === "string"
                    ? metadata.reason
                    : typeof metadata.exceptionReason === "string"
                      ? metadata.exceptionReason
                      : "渠道应付释放失败，请检查渠道规则与对账关联。"),
                createdAt: row.createdAt.toISOString(),
              };
            })}
            outgoingRequests={[
              ...paymentRequests.map((row) => ({
                id: row.id,
                requestNo: row.requestNo,
                category: (
                  ["CHANNEL", "AFFILIATE", "SUPPLIER"] as const
                ).includes(
                  row.requestType as "CHANNEL" | "AFFILIATE" | "SUPPLIER",
                )
                  ? (row.requestType as "CHANNEL" | "AFFILIATE" | "SUPPLIER")
                  : ("OTHER" as const),
                objectName: row.supplier?.name ?? row.reason,
                currency: row.currency,
                amount: row.amount,
                status: row.status,
                createdAt: row.createdAt.toISOString(),
                kind: "PAYMENT" as const,
              })),
              ...expenseClaims.map((row) => ({
                id: row.id,
                requestNo: row.claimNo,
                category: "OTHER" as const,
                objectName:
                  financeUserMap.get(row.employeeId) ?? "员工费用报销",
                currency: row.currency,
                amount: row.totalAmount,
                status: row.status,
                createdAt: row.createdAt.toISOString(),
                kind: "EXPENSE" as const,
              })),
            ]}
          />
        }
        flows={
          <>
            <FinanceFlowHub
              canEdit={
                hasPermissionLevel(invoicePermission, "EDIT") ||
                hasPermissionLevel(receivablePermission, "EDIT") ||
                hasPermissionLevel(channelPermission, "EDIT") ||
                hasPermissionLevel(paymentPermission, "EDIT") ||
                hasPermissionLevel(expensePermission, "EDIT") ||
                hasPermissionLevel(profilePermission, "EDIT")
              }
              data={{
                customers: financeCustomers.map((customer) => ({
                  id: customer.id,
                  label: customer.brandName,
                })),
                customerOptions: financeCustomers.map((customer) => ({
                  id: customer.id,
                  label: customer.brandName,
                })),
                channelAccountOptions: financeUsers
                  .filter((user) => user.role === "CHANNEL")
                  .map((user) => ({ id: user.id, label: user.name })),
                employeeAccountOptions: financeUsers
                  .filter((user) => user.role !== "CHANNEL")
                  .map((user) => ({ id: user.id, label: user.name })),
                affiliateOptions: financeAffiliates.map((affiliate) => ({
                  id: affiliate.id,
                  label:
                    affiliate.internalAffiliateName?.trim() ||
                    affiliate.platformAffiliateName,
                  subtitle: affiliate.platformAffiliateName,
                })),
                contracts: financeCustomers.flatMap((customer) =>
                  customer.contracts.map((contract) => ({
                    id: contract.id,
                    label: contract.contractNo,
                    customerId: customer.id,
                    subtitle: customer.brandName,
                    address: contract.partyAAddress ?? undefined,
                    promoPlatforms: parseStringList(contract.promoPlatform),
                    targetSites: parseStringList(contract.targetSite),
                    affiliatePlatforms: parseStringList(contract.coopChannels),
                    receivingAccounts: contractInvoiceAccounts(
                      contract.partyBBankAccounts,
                    )
                      .map((account) => ({
                        key: account.key,
                        label: account.label,
                      })),
                  })),
                ),
                companyEntities: [
                  { id: "FOSHAN_LINGYUE", label: "佛山灵跃" },
                  { id: "THRAIVE_HK", label: "Thraive 势来" },
                ],
                payerAccounts: financeAccounts
                  .filter((account) =>
                    account.accountType.toUpperCase().includes("COMPANY"),
                  )
                  .map((account) => ({
                    id: account.id,
                    label: account.name,
                    subtitle: `${account.legalEntity} · ${account.currency}`,
                    accountName: account.accountName,
                    accountNumber: account.accountNumber,
                    bankName: account.bankName ?? undefined,
                    currency: account.currency,
                  })),
                payeeAccounts: financeAccounts
                  .filter(
                    (account) =>
                      !account.accountType.toUpperCase().includes("COMPANY"),
                  )
                  .map((account) => ({
                    id: account.id,
                    label: account.name,
                    subtitle: `${account.accountName} · ${account.currency}`,
                    accountName: account.accountName,
                    accountNumber: account.accountNumber,
                    bankName: account.bankName ?? undefined,
                    currency: account.currency,
                  })),
                billingRequests: billingRequests.flatMap((request) =>
                  request.invoices
                    .filter((invoice) => invoice.status === "ISSUED")
                    .map((invoice) => ({
                      id: invoice.id,
                      label:
                        invoice.domesticDocument?.invoiceNumber ??
                        invoice.invoiceNo,
                      subtitle: `${request.customer.brandName} · ${request.currency} ${invoice.totalAmount.toFixed(2)}`,
                    })),
                ),
                receipts: receipts.map((receipt) => ({
                  id: receipt.id,
                  label: receipt.receiptNo,
                  subtitle: `${receipt.customer.brandName} · ${receipt.currency} ${receipt.amount.toFixed(2)}`,
                })),
                financeProfiles: [
                  ...financeCustomers.flatMap((customer) =>
                    customer.billingProfiles.map((profile) => ({
                      id: profile.id,
                      label: profile.name,
                      subtitle: customer.brandName,
                      customerId: customer.id,
                      category: "CUSTOMER_BILLING" as const,
                      accountName: profile.invoiceTitle,
                      accountNumber: profile.bankAccount ?? undefined,
                      bankName: profile.bankName ?? undefined,
                      taxNumber: profile.taxNumber ?? undefined,
                      address: profile.registeredAddress ?? undefined,
                      phone: profile.registeredPhone ?? undefined,
                      email: profile.deliveryEmail ?? undefined,
                      editable: false,
                    })),
                  ),
                  ...financeAccounts.map((account) => ({
                    id: account.id,
                    label: account.name,
                    subtitle: account.legalEntity,
                    category: accountCategory(account.accountType),
                    accountName: account.accountName,
                    accountNumber: account.accountNumber,
                    bankName: account.bankName ?? undefined,
                    currency: account.currency,
                    bankAddress: account.bankAddress ?? undefined,
                    payeeAddress: account.payeeAddress ?? undefined,
                    routingNumber: account.routingNumber ?? undefined,
                    note: account.note ?? undefined,
                    swiftCode: account.swiftCode ?? undefined,
                    editable: true,
                  })),
                ],
                billingProgress: billingRequests
                  .filter((row) => visibleBillingIds.includes(row.id))
                  .map((row) => ({
                    id: row.id,
                    requestNo: row.requestNo,
                    objectName: row.customer.brandName,
                    detail:
                      row.documentType === "DOMESTIC" ? "国内发票" : "Invoice",
                    currency: row.currency,
                    amount: row.requestedAmount,
                    status: row.status,
                    rejectionReason: row.rejectionReason,
                    steps: stepsFor("BILLING_REQUEST", row.id),
                  })),
                paymentProgress: paymentRequests.map((row) => ({
                  id: row.id,
                  requestNo: row.requestNo,
                  objectName: row.supplier?.name ?? "未关联收款对象",
                  detail: row.reason,
                  currency: row.currency,
                  amount: row.amount,
                  status: row.status,
                  rejectionReason: row.rejectionReason,
                  steps: stepsFor("PAYMENT_REQUEST", row.id),
                })),
                expenseProgress: expenseClaims.map((row) => ({
                  id: row.id,
                  requestNo: row.claimNo,
                  objectName: financeUserMap.get(row.employeeId) ?? "员工",
                  detail: row.reimbursementEntity,
                  currency: row.currency,
                  amount: row.totalAmount,
                  status: row.status,
                  rejectionReason: row.rejectionReason,
                  steps: stepsFor("EXPENSE_CLAIM", row.id),
                })),
              }}
            />
            <div className="hidden">
              <UnifiedFinancePanel
                customers={financeCustomers.map((customer) => ({
                  ...customer,
                  contracts: customer.contracts.map((contract) => ({
                    id: contract.id,
                    contractNo: contract.contractNo,
                    promoPlatforms: parseStringList(contract.promoPlatform),
                    targetSites: parseStringList(contract.targetSite),
                    affiliatePlatforms: parseStringList(contract.coopChannels),
                    receivingAccounts: parseStringList(
                      contract.partyBBankAccounts,
                    )
                      .map(invoiceBankAccountForKey)
                      .filter(
                        (account): account is NonNullable<typeof account> =>
                          Boolean(account),
                      ),
                  })),
                }))}
                canEdit={
                  hasPermissionLevel(invoicePermission, "EDIT") ||
                  hasPermissionLevel(receivablePermission, "EDIT") ||
                  hasPermissionLevel(channelPermission, "EDIT") ||
                  hasPermissionLevel(paymentPermission, "EDIT") ||
                  hasPermissionLevel(expensePermission, "EDIT") ||
                  hasPermissionLevel(profilePermission, "EDIT")
                }
                isAdmin={canManageBilling}
                billingFlows={billingRequests.map((row) => ({
                    id: row.id,
                    requestNo: row.requestNo,
                    customerName: row.customer.brandName,
                    documentType: row.documentType,
                    currency: row.currency,
                    amount: row.requestedAmount,
                    status: row.status,
                    rejectionReason: row.rejectionReason,
                    createdAt: row.submittedAt.toISOString(),
                  }))}
                payments={paymentRequests.map((row) => ({
                  id: row.id,
                  requestNo: row.requestNo,
                  supplierName: row.supplier?.name ?? "未关联供应商",
                  reason: row.reason,
                  currency: row.currency,
                  amount: row.amount,
                  status: row.status,
                  rejectionReason: row.rejectionReason,
                  createdAt: row.createdAt.toISOString(),
                }))}
                expenses={expenseClaims.map((row) => ({
                  id: row.id,
                  claimNo: row.claimNo,
                  employeeName:
                    financeUserMap.get(row.employeeId) ?? "未知员工",
                  entity: row.reimbursementEntity,
                  currency: row.currency,
                  amount: row.totalAmount,
                  status: row.status,
                  rejectionReason: row.rejectionReason,
                  createdAt: row.createdAt.toISOString(),
                }))}
              />
            </div>
          </>
        }
      />
    </div>
  );
}
