-- Add persistent invoices and immutable invoice line-item snapshots.
-- This migration only creates new tables and indexes; it does not modify
-- or remove any existing business records.
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNo" TEXT NOT NULL,
    "customerId" TEXT,
    "contractId" TEXT,
    "accountsReceivableId" TEXT,
    "createdById" TEXT,
    "invoiceDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "feeType" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientAddress" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "bankAccountKey" TEXT,
    "bankSnapshot" TEXT NOT NULL DEFAULT '{}',
    "terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_accountsReceivableId_fkey" FOREIGN KEY ("accountsReceivableId") REFERENCES "AccountsReceivable" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "promoPlatform" TEXT,
    "targetSite" TEXT,
    "affiliatePlatform" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX "Invoice_contractId_idx" ON "Invoice"("contractId");
CREATE INDEX "Invoice_accountsReceivableId_idx" ON "Invoice"("accountsReceivableId");
CREATE INDEX "Invoice_createdById_idx" ON "Invoice"("createdById");
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_deletedAt_idx" ON "Invoice"("deletedAt");
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");
CREATE INDEX "InvoiceItem_sortOrder_idx" ON "InvoiceItem"("sortOrder");
