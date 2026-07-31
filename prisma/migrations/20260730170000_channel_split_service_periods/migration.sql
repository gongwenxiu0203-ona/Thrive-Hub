-- Separate fixed-fee and commission waterfall periods.
-- Additive only: historical rows remain compatible through streamType=BOTH.

ALTER TABLE "ChannelReconciliationPeriod"
ADD COLUMN "streamType" TEXT NOT NULL DEFAULT 'BOTH';

ALTER TABLE "ChannelReconciliation"
ADD COLUMN "channelPayeeSnapshot" TEXT NOT NULL DEFAULT '{}';

CREATE INDEX "ChannelReconciliationPeriod_reconciliationId_streamType_periodIndex_idx"
ON "ChannelReconciliationPeriod"("reconciliationId", "streamType", "periodIndex");
