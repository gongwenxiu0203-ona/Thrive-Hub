-- Add a per-line fee type so one Invoice can contain both monthly fees and
-- sales commissions. Existing line items remain valid as monthly fees.
ALTER TABLE "InvoiceItem"
ADD COLUMN "feeType" TEXT NOT NULL DEFAULT 'MONTHLY_FEE';

-- Preserve the parent Invoice fee type for any existing line items. The
-- default above remains the fallback for legacy or malformed parent values.
UPDATE "InvoiceItem"
SET "feeType" = COALESCE(
  (
    SELECT CASE
      WHEN "Invoice"."feeType" IN ('MONTHLY_FEE', 'SALES_COMMISSION')
        THEN "Invoice"."feeType"
      ELSE NULL
    END
    FROM "Invoice"
    WHERE "Invoice"."id" = "InvoiceItem"."invoiceId"
  ),
  'MONTHLY_FEE'
);

CREATE INDEX "InvoiceItem_feeType_idx" ON "InvoiceItem"("feeType");
