-- Add v3 contract template fields to Contract
-- Non-destructive: ADD COLUMN only.

ALTER TABLE "Contract" ADD COLUMN "promoPlatform" TEXT;
ALTER TABLE "Contract" ADD COLUMN "targetSite" TEXT;
ALTER TABLE "Contract" ADD COLUMN "thresholdAmount" TEXT;
ALTER TABLE "Contract" ADD COLUMN "thresholdCurrency" TEXT;
ALTER TABLE "Contract" ADD COLUMN "tieredRules" TEXT;
ALTER TABLE "Contract" ADD COLUMN "excessBaseMonths" TEXT;
ALTER TABLE "Contract" ADD COLUMN "excessCommissionRate" TEXT;
ALTER TABLE "Contract" ADD COLUMN "gmvSettlementCycle" TEXT;
