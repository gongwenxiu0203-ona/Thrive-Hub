-- Additive finance workflow migration. Existing business tables and rows are preserved.
ALTER TABLE "CustomerReconciliation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "CustomerReconciliation" ADD COLUMN "planStatus" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "CustomerReconciliation" ADD COLUMN "periodIndex" INTEGER;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "automationKey" TEXT;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "periodAdjusted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "adjustmentReason" TEXT;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "originalPeriodStart" DATETIME;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "originalPeriodEnd" DATETIME;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "openedAt" DATETIME;

ALTER TABLE "Invoice" ADD COLUMN "billingRequestId" TEXT REFERENCES "BillingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'INVOICE';
ALTER TABLE "Invoice" ADD COLUMN "issuedAt" DATETIME;

ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "payableStatus" TEXT NOT NULL DEFAULT 'WAITING_CUSTOMER_RECEIPT';
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "businessDocumentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "financeReviewStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "paymentVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ReconciliationPeriodAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reconciliationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "beforeStart" DATETIME NOT NULL,
  "beforeEnd" DATETIME NOT NULL,
  "afterStart" DATETIME NOT NULL,
  "afterEnd" DATETIME NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationPeriodAudit_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CustomerReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReconciliationPeriodAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BillingRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestNo" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "acceptedById" TEXT,
  "customerId" TEXT NOT NULL,
  "contractId" TEXT,
  "legalEntityKey" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "mergeMode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "currency" TEXT NOT NULL,
  "requestedAmount" REAL NOT NULL,
  "rejectionReason" TEXT,
  "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BillingRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BillingRequest_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BillingRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BillingRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BillingRequestLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "requestedAmount" REAL NOT NULL,
  "feeType" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BillingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BillingRequestLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CustomerReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BillingDocumentAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invoiceId" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "requestLineId" TEXT,
  "amount" REAL NOT NULL,
  "feeType" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingDocumentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BillingDocumentAllocation_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CustomerReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DomesticInvoiceDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invoiceId" TEXT NOT NULL,
  "invoiceCode" TEXT,
  "invoiceNumber" TEXT NOT NULL,
  "invoiceType" TEXT NOT NULL,
  "taxInclusiveAmount" REAL NOT NULL,
  "netAmount" REAL NOT NULL,
  "taxAmount" REAL NOT NULL,
  "taxRate" REAL,
  "originalFileUrl" TEXT,
  "uploadedById" TEXT,
  "uploadedAt" DATETIME,
  "voidedAt" DATETIME,
  "redInvoiceId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DomesticInvoiceDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DomesticInvoiceDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CustomerReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "receiptNo" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "receivedAt" DATETIME NOT NULL,
  "bankReference" TEXT,
  "proofUrls" TEXT NOT NULL DEFAULT '[]',
  "remark" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNALLOCATED',
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CustomerReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CustomerReceiptAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "accountsReceivableId" TEXT,
  "invoiceId" TEXT,
  "reconciliationId" TEXT,
  "feeType" TEXT NOT NULL,
  "allocatedAmount" REAL NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "reversedAt" DATETIME,
  "reversedById" TEXT,
  "reversalReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerReceiptAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "CustomerReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerReceiptAllocation_accountsReceivableId_fkey" FOREIGN KEY ("accountsReceivableId") REFERENCES "AccountsReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CustomerReceiptAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CustomerReceiptAllocation_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CustomerReconciliation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CustomerReceiptAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerReceiptAllocation_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ChannelPayableSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "allocationId" TEXT NOT NULL,
  "channelPeriodId" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "feeType" TEXT NOT NULL,
  "sourceAmount" REAL NOT NULL,
  "shareRateSnapshot" REAL NOT NULL,
  "payableAmount" REAL NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "exceptionReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelPayableSource_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "CustomerReceiptAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChannelPayableSource_channelPeriodId_fkey" FOREIGN KEY ("channelPeriodId") REFERENCES "ChannelReconciliationPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChannelPayableSource_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CustomerReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ChannelBusinessDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channelPeriodId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "documentNo" TEXT,
  "documentDate" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" DATETIME,
  "rejectionReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelBusinessDocument_channelPeriodId_fkey" FOREIGN KEY ("channelPeriodId") REFERENCES "ChannelReconciliationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChannelBusinessDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChannelBusinessDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ChannelPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channelPeriodId" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "currency" TEXT NOT NULL,
  "paidAt" DATETIME NOT NULL,
  "transactionNo" TEXT,
  "proofUrls" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'PAID',
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelPayment_channelPeriodId_fkey" FOREIGN KEY ("channelPeriodId") REFERENCES "ChannelReconciliationPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChannelPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FinanceAuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "actorId" TEXT NOT NULL,
  "note" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomerReconciliation_automationKey_key" ON "CustomerReconciliation"("automationKey");
CREATE INDEX "CustomerReconciliation_contractId_reconcileType_periodStart_idx" ON "CustomerReconciliation"("contractId", "reconcileType", "periodStart");
CREATE INDEX "CustomerReconciliation_planStatus_periodStart_idx" ON "CustomerReconciliation"("planStatus", "periodStart");
CREATE INDEX "Invoice_billingRequestId_idx" ON "Invoice"("billingRequestId");
CREATE INDEX "ReconciliationPeriodAudit_reconciliationId_createdAt_idx" ON "ReconciliationPeriodAudit"("reconciliationId", "createdAt");
CREATE INDEX "ReconciliationPeriodAudit_actorId_idx" ON "ReconciliationPeriodAudit"("actorId");
CREATE UNIQUE INDEX "BillingRequest_requestNo_key" ON "BillingRequest"("requestNo");
CREATE INDEX "BillingRequest_customerId_status_idx" ON "BillingRequest"("customerId", "status");
CREATE INDEX "BillingRequest_applicantId_status_idx" ON "BillingRequest"("applicantId", "status");
CREATE INDEX "BillingRequest_submittedAt_idx" ON "BillingRequest"("submittedAt");
CREATE INDEX "BillingRequestLine_reconciliationId_idx" ON "BillingRequestLine"("reconciliationId");
CREATE UNIQUE INDEX "BillingRequestLine_requestId_reconciliationId_feeType_key" ON "BillingRequestLine"("requestId", "reconciliationId", "feeType");
CREATE INDEX "BillingDocumentAllocation_reconciliationId_idx" ON "BillingDocumentAllocation"("reconciliationId");
CREATE INDEX "BillingDocumentAllocation_requestLineId_idx" ON "BillingDocumentAllocation"("requestLineId");
CREATE UNIQUE INDEX "BillingDocumentAllocation_invoiceId_reconciliationId_feeType_key" ON "BillingDocumentAllocation"("invoiceId", "reconciliationId", "feeType");
CREATE UNIQUE INDEX "DomesticInvoiceDocument_invoiceId_key" ON "DomesticInvoiceDocument"("invoiceId");
CREATE INDEX "DomesticInvoiceDocument_invoiceNumber_idx" ON "DomesticInvoiceDocument"("invoiceNumber");
CREATE INDEX "DomesticInvoiceDocument_redInvoiceId_idx" ON "DomesticInvoiceDocument"("redInvoiceId");
CREATE UNIQUE INDEX "CustomerReceipt_receiptNo_key" ON "CustomerReceipt"("receiptNo");
CREATE INDEX "CustomerReceipt_customerId_receivedAt_idx" ON "CustomerReceipt"("customerId", "receivedAt");
CREATE INDEX "CustomerReceipt_status_idx" ON "CustomerReceipt"("status");
CREATE UNIQUE INDEX "CustomerReceiptAllocation_idempotencyKey_key" ON "CustomerReceiptAllocation"("idempotencyKey");
CREATE INDEX "CustomerReceiptAllocation_receiptId_status_idx" ON "CustomerReceiptAllocation"("receiptId", "status");
CREATE INDEX "CustomerReceiptAllocation_accountsReceivableId_idx" ON "CustomerReceiptAllocation"("accountsReceivableId");
CREATE INDEX "CustomerReceiptAllocation_invoiceId_idx" ON "CustomerReceiptAllocation"("invoiceId");
CREATE INDEX "CustomerReceiptAllocation_reconciliationId_idx" ON "CustomerReceiptAllocation"("reconciliationId");
CREATE INDEX "ChannelPayableSource_channelPeriodId_status_idx" ON "ChannelPayableSource"("channelPeriodId", "status");
CREATE INDEX "ChannelPayableSource_reconciliationId_idx" ON "ChannelPayableSource"("reconciliationId");
CREATE UNIQUE INDEX "ChannelPayableSource_allocationId_channelPeriodId_feeType_key" ON "ChannelPayableSource"("allocationId", "channelPeriodId", "feeType");
CREATE INDEX "ChannelBusinessDocument_channelPeriodId_status_idx" ON "ChannelBusinessDocument"("channelPeriodId", "status");
CREATE INDEX "ChannelPayment_channelPeriodId_status_idx" ON "ChannelPayment"("channelPeriodId", "status");
CREATE INDEX "ChannelPayment_paidAt_idx" ON "ChannelPayment"("paidAt");
CREATE INDEX "FinanceAuditLog_entityType_entityId_createdAt_idx" ON "FinanceAuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "FinanceAuditLog_actorId_idx" ON "FinanceAuditLog"("actorId");
