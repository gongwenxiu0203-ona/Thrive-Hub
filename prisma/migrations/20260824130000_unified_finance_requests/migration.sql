ALTER TABLE "BillingRequest" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'RECONCILIATION';
ALTER TABLE "BillingRequest" ADD COLUMN "applicantNote" TEXT;

CREATE TABLE "CustomerBillingProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "invoiceTitle" TEXT NOT NULL,
  "taxNumber" TEXT,
  "registeredAddress" TEXT,
  "registeredPhone" TEXT,
  "bankName" TEXT,
  "bankAccount" TEXT,
  "deliveryEmail" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CustomerBillingProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CustomerBillingProfile_customerId_status_idx" ON "CustomerBillingProfile"("customerId", "status");

CREATE TABLE "ManualBillingRequestItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "feeType" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "periodType" TEXT NOT NULL DEFAULT 'DATE_RANGE',
  "periodLabel" TEXT NOT NULL,
  "promoPlatform" TEXT,
  "targetSite" TEXT,
  "affiliatePlatform" TEXT,
  "quantity" REAL NOT NULL DEFAULT 1,
  "unitPrice" REAL NOT NULL,
  "amount" REAL NOT NULL,
  "remark" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ManualBillingRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BillingRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ManualBillingRequestItem_requestId_sortOrder_idx" ON "ManualBillingRequestItem"("requestId", "sortOrder");
CREATE INDEX "ManualBillingRequestItem_feeType_idx" ON "ManualBillingRequestItem"("feeType");

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "supplierNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'SUPPLIER',
  "country" TEXT,
  "taxNumber" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Supplier_supplierNo_key" ON "Supplier"("supplierNo");
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");
CREATE INDEX "Supplier_type_status_idx" ON "Supplier"("type", "status");

CREATE TABLE "SupplierBankAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "supplierId" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "bankName" TEXT,
  "accountNumber" TEXT NOT NULL,
  "country" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "swiftCode" TEXT,
  "bankAddress" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SupplierBankAccount_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupplierBankAccount_supplierId_status_idx" ON "SupplierBankAccount"("supplierId", "status");

CREATE TABLE "PaymentRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestNo" TEXT NOT NULL,
  "requestType" TEXT NOT NULL DEFAULT 'SUPPLIER',
  "applicantId" TEXT NOT NULL,
  "supplierId" TEXT,
  "payerEntity" TEXT NOT NULL,
  "payerAccountKey" TEXT,
  "payeeSnapshot" TEXT NOT NULL DEFAULT '{}',
  "reason" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "scheduledAt" DATETIME,
  "relatedReceiptId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "approvedById" TEXT,
  "approvedAt" DATETIME,
  "rejectionReason" TEXT,
  "paidById" TEXT,
  "paidAt" DATETIME,
  "transactionNo" TEXT,
  "paymentProofUrls" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PaymentRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentRequest_requestNo_key" ON "PaymentRequest"("requestNo");
CREATE INDEX "PaymentRequest_status_createdAt_idx" ON "PaymentRequest"("status", "createdAt");
CREATE INDEX "PaymentRequest_supplierId_idx" ON "PaymentRequest"("supplierId");
CREATE INDEX "PaymentRequest_applicantId_idx" ON "PaymentRequest"("applicantId");

CREATE TABLE "PaymentRequestItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "paymentRequestId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "currency" TEXT NOT NULL,
  "invoiceUrls" TEXT NOT NULL DEFAULT '[]',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRequestItem_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PaymentRequestItem_paymentRequestId_sortOrder_idx" ON "PaymentRequestItem"("paymentRequestId", "sortOrder");

CREATE TABLE "ExpenseClaim" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "claimNo" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "reimbursementEntity" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "totalAmount" REAL NOT NULL,
  "payeeSnapshot" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "approvedById" TEXT,
  "approvedAt" DATETIME,
  "rejectionReason" TEXT,
  "paidAt" DATETIME,
  "paymentProofUrls" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ExpenseClaim_claimNo_key" ON "ExpenseClaim"("claimNo");
CREATE INDEX "ExpenseClaim_status_createdAt_idx" ON "ExpenseClaim"("status", "createdAt");
CREATE INDEX "ExpenseClaim_employeeId_idx" ON "ExpenseClaim"("employeeId");

CREATE TABLE "ExpenseClaimItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expenseClaimId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "expenseType" TEXT NOT NULL,
  "expenseDate" DATETIME NOT NULL,
  "currency" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "invoiceTitle" TEXT,
  "invoiceNumber" TEXT,
  "invoiceUrls" TEXT NOT NULL DEFAULT '[]',
  "remark" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseClaimItem_expenseClaimId_fkey" FOREIGN KEY ("expenseClaimId") REFERENCES "ExpenseClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ExpenseClaimItem_expenseClaimId_sortOrder_idx" ON "ExpenseClaimItem"("expenseClaimId", "sortOrder");
CREATE INDEX "ExpenseClaimItem_invoiceNumber_idx" ON "ExpenseClaimItem"("invoiceNumber");

CREATE TABLE "FinanceApprovalStep" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "stepNo" INTEGER NOT NULL,
  "stepType" TEXT NOT NULL,
  "assigneeId" TEXT,
  "operatorId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "comment" TEXT,
  "actedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FinanceApprovalStep_entityType_entityId_stepNo_key" ON "FinanceApprovalStep"("entityType", "entityId", "stepNo");
CREATE INDEX "FinanceApprovalStep_assigneeId_status_idx" ON "FinanceApprovalStep"("assigneeId", "status");
CREATE INDEX "FinanceApprovalStep_entityType_entityId_idx" ON "FinanceApprovalStep"("entityType", "entityId");

CREATE TABLE "FinanceAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "attachmentType" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT,
  "uploadedById" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FinanceAttachment_entityType_entityId_attachmentType_idx" ON "FinanceAttachment"("entityType", "entityId", "attachmentType");
