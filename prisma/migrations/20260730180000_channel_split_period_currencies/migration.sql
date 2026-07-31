-- Persist the actual received currency independently for each waterfall period.
-- Additive only: historical NULL values fall back to the reconciliation currency.

ALTER TABLE "ChannelReconciliationPeriod"
ADD COLUMN "fixedFeeReceivedCurrency" TEXT;

ALTER TABLE "ChannelReconciliationPeriod"
ADD COLUMN "commissionReceivedCurrency" TEXT;
