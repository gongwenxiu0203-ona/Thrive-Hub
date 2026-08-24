ALTER TABLE "PaymentRequest" ADD COLUMN "relatedInvoiceId" TEXT;
ALTER TABLE "ManualBillingRequestItem" ADD COLUMN "serviceMonths" TEXT;
ALTER TABLE "ManualBillingRequestItem" ADD COLUMN "netAmount" REAL;
ALTER TABLE "ManualBillingRequestItem" ADD COLUMN "taxRate" REAL;
ALTER TABLE "ManualBillingRequestItem" ADD COLUMN "taxAmount" REAL;
ALTER TABLE "ManualBillingRequestItem" ADD COLUMN "grossAmount" REAL;
CREATE INDEX "PaymentRequest_relatedInvoiceId_idx" ON "PaymentRequest"("relatedInvoiceId");
CREATE INDEX "PaymentRequest_relatedReceiptId_idx" ON "PaymentRequest"("relatedReceiptId");

CREATE TABLE "DomesticInvoiceLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "specification" TEXT,
  "unit" TEXT,
  "quantity" REAL NOT NULL DEFAULT 1,
  "unitPrice" REAL NOT NULL,
  "netAmount" REAL NOT NULL,
  "taxRate" REAL NOT NULL,
  "taxAmount" REAL NOT NULL,
  "taxInclusiveAmount" REAL NOT NULL,
  "serviceMonths" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DomesticInvoiceLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DomesticInvoiceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DomesticInvoiceLine_documentId_sortOrder_idx" ON "DomesticInvoiceLine"("documentId", "sortOrder");
CREATE INDEX "DomesticInvoiceLine_serviceMonths_idx" ON "DomesticInvoiceLine"("serviceMonths");

CREATE TABLE "FinanceAccountProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "legalEntity" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "bankName" TEXT,
  "accountNumber" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "country" TEXT,
  "swiftCode" TEXT,
  "bankAddress" TEXT,
  "payerAccountKey" TEXT,
  "attachmentUrls" TEXT NOT NULL DEFAULT '[]',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FinanceAccountProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinanceAccountProfile_profileNo_key" ON "FinanceAccountProfile"("profileNo");
CREATE INDEX "FinanceAccountProfile_legalEntity_status_idx" ON "FinanceAccountProfile"("legalEntity", "status");
CREATE INDEX "FinanceAccountProfile_accountType_status_idx" ON "FinanceAccountProfile"("accountType", "status");
CREATE INDEX "FinanceAccountProfile_currency_status_idx" ON "FinanceAccountProfile"("currency", "status");
