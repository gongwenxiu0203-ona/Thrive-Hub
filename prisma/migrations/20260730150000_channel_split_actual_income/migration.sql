-- Channel split actual-income workflow.
-- Additive only: legacy contract/reconciliation links and historical rows remain untouched.

ALTER TABLE "ChannelReconciliation" ADD COLUMN "recordMode" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "ChannelReconciliation" ADD COLUMN "fixedFeeReceivedCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "ChannelReconciliation" ADD COLUMN "commissionReceivedCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "ChannelReconciliation" ADD COLUMN "auditLog" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "ChannelSplitRule" ADD COLUMN "commissionThresholdAmount" REAL NOT NULL DEFAULT 4400;
ALTER TABLE "ChannelSplitRule" ADD COLUMN "commissionThresholdCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "ChannelSplitRule" ADD COLUMN "commissionBelowRate" REAL NOT NULL DEFAULT 0.15;
ALTER TABLE "ChannelSplitRule" ADD COLUMN "commissionAtOrAboveRate" REAL NOT NULL DEFAULT 0.25;

ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "periodStart" DATETIME;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "periodEnd" DATETIME;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "fixedFeeReceived" REAL;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "commissionReceived" REAL;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "fixedFeeShareRate" REAL;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "commissionShareRate" REAL;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "fixedFeeShareAmount" REAL;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "commissionShareAmount" REAL;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "fixedFeeSplitDate" DATETIME;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "commissionSplitDate" DATETIME;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "confirmedGmv" REAL;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "auditLog" TEXT NOT NULL DEFAULT '[]';

CREATE INDEX "ChannelReconciliation_customerId_recordMode_idx"
ON "ChannelReconciliation"("customerId", "recordMode");

-- New workflow: one channel-split master record per customer.
-- Historical rows keep recordMode=LEGACY and are intentionally unaffected.
CREATE UNIQUE INDEX "ChannelReconciliation_rule_driven_customer_unique"
ON "ChannelReconciliation"("customerId")
WHERE "recordMode" = 'RULE_DRIVEN';
