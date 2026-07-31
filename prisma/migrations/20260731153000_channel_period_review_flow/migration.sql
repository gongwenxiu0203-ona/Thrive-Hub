-- Add per-period channel review workflow and separate payment receipt storage.
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "channelReviewStatus" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "channelPushedAt" DATETIME;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "channelReviewedAt" DATETIME;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "channelDisputeReason" TEXT;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "channelReviewVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChannelReconciliationPeriod" ADD COLUMN "paymentProofUrl" TEXT;

CREATE INDEX "ChannelReconciliationPeriod_reconciliationId_channelReviewStatus_idx"
ON "ChannelReconciliationPeriod"("reconciliationId", "channelReviewStatus");