-- Add free-text person-in-charge name to Affiliate (for bulk-uploaded data)
ALTER TABLE "Affiliate" ADD COLUMN "personInChargeName" TEXT;
