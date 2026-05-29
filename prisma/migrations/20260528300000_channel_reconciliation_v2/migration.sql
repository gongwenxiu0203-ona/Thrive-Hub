-- ChannelReconciliation v2: combined fixed-fee + commission tracking with received amounts,
-- separate currencies, estimated/actual dates, and transfer-proof screenshots.
-- Non-destructive ADD COLUMN only. `settlementId` relaxed to NULL-able via Prisma.

ALTER TABLE "ChannelReconciliation" ADD COLUMN "contractId" TEXT;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "customerReconciliationId" TEXT;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "periodNo" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "periodStart" DATETIME;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "periodEnd" DATETIME;

-- 固费分账
ALTER TABLE "ChannelReconciliation" ADD COLUMN "fixedFeeReceived" REAL;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "fixedFeeShareAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "fixedFeeShareCurrency" TEXT NOT NULL DEFAULT '人民币';
ALTER TABLE "ChannelReconciliation" ADD COLUMN "fixedFeeEstimatedDate" DATETIME;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "fixedFeeActualDate" DATETIME;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "fixedFeeProofUrl" TEXT;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "fixedFeePushedToChannel" BOOLEAN NOT NULL DEFAULT false;

-- 抽佣分账
ALTER TABLE "ChannelReconciliation" ADD COLUMN "commissionReceived" REAL;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "commissionShareAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "commissionShareCurrency" TEXT NOT NULL DEFAULT '人民币';
ALTER TABLE "ChannelReconciliation" ADD COLUMN "commissionEstimatedDate" DATETIME;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "commissionActualDate" DATETIME;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "commissionProofUrl" TEXT;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "commissionPushedToChannel" BOOLEAN NOT NULL DEFAULT false;

-- 索引
CREATE INDEX "ChannelReconciliation_customerReconciliationId_idx" ON "ChannelReconciliation"("customerReconciliationId");
CREATE INDEX "ChannelReconciliation_periodStart_idx" ON "ChannelReconciliation"("periodStart");
