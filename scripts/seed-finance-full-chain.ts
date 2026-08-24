import { PrismaClient } from "@prisma/client";
import { createCustomerReceipt } from "../src/lib/financeWorkflow";

const prisma = new PrismaClient();
const BRAND = "[链路测试] 财务全流程 20260821";
const CONTRACT_NO = "TEST-FINANCE-CHAIN-20260821";

async function printLinks(customerId: string) {
  const data = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      brandName: true,
      billingRequests: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
      channelReconciliations: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
      invoices: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, invoiceNo: true } },
    },
  });
  console.log(JSON.stringify({
    customer: data,
    links: {
      customerReconciliation: `/finance/customers/${customerId}`,
      financeWorkbench: "/finance/workbench",
      billingRequest: data?.billingRequests[0] ? `/finance/workbench` : null,
      invoice: data?.invoices[0] ? `/invoices/${data.invoices[0].id}` : null,
      channelReconciliation: data?.channelReconciliations[0] ? `/finance/channel-reconciliations/${data.channelReconciliations[0].id}` : null,
    },
  }, null, 2));
}

async function main() {
  const existing = await prisma.customer.findFirst({ where: { brandName: BRAND, deletedAt: null }, select: { id: true } });
  if (existing) return printLinks(existing.id);

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", status: "APPROVED" }, select: { id: true } });
  const channel = await prisma.user.findFirst({ where: { role: "CHANNEL", status: "APPROVED" }, select: { id: true } });
  if (!admin || !channel) throw new Error("需要至少一名已审核管理员和一名已审核渠道商");

  const periodStart = new Date("2026-08-01T00:00:00.000Z");
  const periodEnd = new Date("2026-08-31T00:00:00.000Z");
  const invoiceDate = new Date("2026-08-21T00:00:00.000Z");
  const dueDate = new Date("2026-09-20T00:00:00.000Z");

  const base = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        brandName: BRAND,
        status: "COOPERATING",
        rating: "A",
        channelUserId: channel.id,
        businessOwnerId: admin.id,
        createdById: admin.id,
        contactName: "财务链路测试联系人",
        contactEmail: "finance-chain-test@example.invalid",
      },
    });
    const contract = await tx.contract.create({
      data: {
        contractNo: CONTRACT_NO,
        customerId: customer.id,
        type: "BRAND",
        status: "COMPLETED",
        ownerId: admin.id,
        partyA: "财务全链路测试主体",
        accountingPeriod: "自然月",
        feeCycle: "月度",
        feeAmount: "3000",
        feeCurrency: "人民币",
        commissionType: "FIXED",
        commissionRate: "10%",
        paymentCycle: "开票后30天",
        startDate: periodStart,
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        createdById: admin.id,
      },
    });
    await tx.channelSplitRule.create({
      data: {
        customerId: customer.id,
        contractId: null,
        ruleType: "A",
        splitEndDate: new Date("2026-12-31T00:00:00.000Z"),
        fixedFeeRate: 0.15,
        commissionRate: 0.15,
        commissionThresholdAmount: 4400,
        commissionThresholdCurrency: "RMB",
        commissionBelowRate: 0.15,
        commissionAtOrAboveRate: 0.25,
        createdById: admin.id,
      },
    });
    const reconciliation = await tx.customerReconciliation.create({
      data: {
        customerId: customer.id,
        contractId: contract.id,
        source: "MANUAL",
        planStatus: "OPEN",
        periodStart,
        periodEnd,
        partyA: "财务全链路测试主体",
        accountingPeriod: "自然月",
        commissionRate: 0.1,
        actualSalesAmount: 100000,
        actualCommissionRate: 0.1,
        commissionAmount: 10000,
        commissionCurrency: "人民币",
        reconcileType: "COMMISSION_ONLY",
        status: "CONFIRMED",
        finalSalesAmount: 100000,
        finalCommissionAmount: 10000,
        submittedById: admin.id,
        submittedAt: new Date(),
        createdById: admin.id,
      },
    });
    const request = await tx.billingRequest.create({
      data: {
        requestNo: `BR-TEST-${Date.now()}`,
        applicantId: admin.id,
        acceptedById: admin.id,
        customerId: customer.id,
        contractId: contract.id,
        legalEntityKey: "财务全链路测试主体",
        documentType: "INVOICE",
        mergeMode: "MERGED",
        status: "COMPLETED",
        currency: "RMB",
        requestedAmount: 10000,
        acceptedAt: new Date(),
        completedAt: new Date(),
        lines: { create: { reconciliationId: reconciliation.id, requestedAmount: 10000, feeType: "COMMISSION", currency: "RMB", sortOrder: 0 } },
      },
      include: { lines: true },
    });
    const receivable = await tx.accountsReceivable.create({
      data: {
        customerId: customer.id,
        invoiceNo: "TEST-INV-20260821",
        invoiceDate,
        invoiceAmount: 10000,
        currency: "RMB",
        exchangeRate: 1,
        amountRmb: 10000,
        receivedAmount: 0,
        dueDate,
        status: "NOT_DUE",
        riskLevel: "GREEN",
      },
    });
    const invoice = await tx.invoice.create({
      data: {
        invoiceNo: "TEST-INV-20260821",
        customerId: customer.id,
        contractId: contract.id,
        accountsReceivableId: receivable.id,
        createdById: admin.id,
        billingRequestId: request.id,
        documentType: "INVOICE",
        issuedAt: invoiceDate,
        invoiceDate,
        dueDate,
        periodType: "DATE_RANGE",
        periodLabel: "2026-08-01 ~ 2026-08-31",
        feeType: "SALES_COMMISSION",
        clientName: "财务全链路测试主体",
        currency: "RMB",
        totalAmount: 10000,
        bankSnapshot: JSON.stringify({ bankName: "测试银行", accountNo: "TEST-ACCOUNT" }),
        status: "ISSUED",
        items: { create: { feeType: "SALES_COMMISSION", currency: "RMB", periodType: "DATE_RANGE", periodLabel: "2026-08-01 ~ 2026-08-31", description: "销售佣金", quantity: 1, unitPrice: 10000, amount: 10000, sortOrder: 0 } },
        reconciliationLinks: { create: { reconciliationId: reconciliation.id, sortOrder: 0 } },
        billingAllocations: { create: { reconciliationId: reconciliation.id, requestLineId: request.lines[0].id, amount: 10000, feeType: "COMMISSION", currency: "RMB" } },
      },
    });
    return { customer, contract, reconciliation, request, invoice, receivable, adminId: admin.id, channelId: channel.id };
  });

  await createCustomerReceipt({
    customerId: base.customer.id,
    currency: "RMB",
    amount: 10000,
    receivedAt: new Date("2026-08-25T00:00:00.000Z"),
    bankReference: "TEST-BANK-RECEIPT-20260821",
    proofUrls: ["/uploads/test/customer-receipt-proof.pdf"],
    remark: "财务全链路自动测试到账",
    createdById: base.adminId,
    allocations: [{ accountsReceivableId: base.receivable.id, invoiceId: base.invoice.id, reconciliationId: base.reconciliation.id, feeType: "COMMISSION", amount: 10000 }],
  });

  const source = await prisma.channelPayableSource.findFirst({
    where: { reconciliationId: base.reconciliation.id, status: "ACTIVE" },
    include: { channelPeriod: true },
  });
  if (!source) throw new Error("核销后未生成渠道应付来源");
  await prisma.$transaction(async (tx) => {
    await tx.channelBusinessDocument.create({
      data: {
        channelPeriodId: source.channelPeriodId,
        uploadedById: base.channelId,
        documentType: "INVOICE",
        streamType: "COMMISSION",
        fileUrl: "/uploads/test/channel-invoice-proof.pdf",
        documentNo: "TEST-CHANNEL-DOC-20260821",
        documentDate: new Date("2026-08-26T00:00:00.000Z"),
        status: "APPROVED",
        reviewedById: base.adminId,
        reviewedAt: new Date("2026-08-26T00:00:00.000Z"),
      },
    });
    await tx.channelPayment.create({
      data: {
        channelPeriodId: source.channelPeriodId,
        streamType: "COMMISSION",
        amount: source.payableAmount,
        currency: source.currency,
        paidAt: new Date("2026-08-27T00:00:00.000Z"),
        transactionNo: "TEST-CHANNEL-PAY-20260821",
        proofUrls: JSON.stringify(["/uploads/test/channel-payment-proof.pdf"]),
        status: "PAID",
        createdById: base.adminId,
      },
    });
    await tx.channelReconciliationPeriod.update({
      where: { id: source.channelPeriodId },
      data: {
        channelReviewStatus: "CONFIRMED",
        businessDocumentStatus: "APPROVED",
        financeReviewStatus: "APPROVED",
        payableStatus: "PAID",
        commissionPaidAt: new Date("2026-08-27T00:00:00.000Z"),
      },
    });
  });
  await printLinks(base.customer.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
