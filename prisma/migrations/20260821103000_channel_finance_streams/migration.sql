ALTER TABLE "ChannelBusinessDocument" ADD COLUMN "streamType" TEXT NOT NULL DEFAULT 'BOTH';
ALTER TABLE "ChannelPayment" ADD COLUMN "streamType" TEXT NOT NULL DEFAULT 'BOTH';
CREATE INDEX "ChannelBusinessDocument_channelPeriodId_streamType_status_idx" ON "ChannelBusinessDocument"("channelPeriodId", "streamType", "status");
CREATE INDEX "ChannelPayment_channelPeriodId_streamType_status_idx" ON "ChannelPayment"("channelPeriodId", "streamType", "status");
