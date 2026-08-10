CREATE TABLE "InvoiceReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceReconciliation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceReconciliation_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CustomerReconciliation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InvoiceReconciliation_reconciliationId_key" ON "InvoiceReconciliation"("reconciliationId");
CREATE INDEX "InvoiceReconciliation_invoiceId_sortOrder_idx" ON "InvoiceReconciliation"("invoiceId", "sortOrder");
CREATE UNIQUE INDEX "InvoiceReconciliation_invoiceId_reconciliationId_key" ON "InvoiceReconciliation"("invoiceId", "reconciliationId");