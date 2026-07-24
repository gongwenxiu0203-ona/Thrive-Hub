-- Add ordered multi-contract links while preserving Invoice.contractId as the
-- primary/legacy contract reference.
CREATE TABLE "InvoiceContract" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invoiceId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceContract_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InvoiceContract_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Backfill every existing primary contract as the first ordered link.
INSERT INTO "InvoiceContract" ("id", "invoiceId", "contractId", "sortOrder")
SELECT "id" || ':' || "contractId", "id", "contractId", 0
FROM "Invoice"
WHERE "contractId" IS NOT NULL;

CREATE UNIQUE INDEX "InvoiceContract_invoiceId_contractId_key"
  ON "InvoiceContract"("invoiceId", "contractId");
CREATE INDEX "InvoiceContract_invoiceId_sortOrder_idx"
  ON "InvoiceContract"("invoiceId", "sortOrder");
CREATE INDEX "InvoiceContract_contractId_idx"
  ON "InvoiceContract"("contractId");
