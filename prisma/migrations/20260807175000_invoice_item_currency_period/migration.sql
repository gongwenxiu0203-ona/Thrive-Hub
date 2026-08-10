-- Add line-level currency and service-period snapshots without removing legacy
-- Invoice-level compatibility fields.
ALTER TABLE "InvoiceItem" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "InvoiceItem" ADD COLUMN "periodType" TEXT NOT NULL DEFAULT 'MONTH';
ALTER TABLE "InvoiceItem" ADD COLUMN "periodLabel" TEXT NOT NULL DEFAULT '';

-- Preserve every existing line by backfilling from its parent Invoice.
UPDATE "InvoiceItem"
SET "currency" = COALESCE(
  NULLIF((SELECT "currency" FROM "Invoice" WHERE "Invoice"."id" = "InvoiceItem"."invoiceId"), ''),
  'USD'
),
"periodType" = COALESCE(
  NULLIF((SELECT "periodType" FROM "Invoice" WHERE "Invoice"."id" = "InvoiceItem"."invoiceId"), ''),
  'MONTH'
),
"periodLabel" = COALESCE(
  (SELECT "periodLabel" FROM "Invoice" WHERE "Invoice"."id" = "InvoiceItem"."invoiceId"),
  ''
);
