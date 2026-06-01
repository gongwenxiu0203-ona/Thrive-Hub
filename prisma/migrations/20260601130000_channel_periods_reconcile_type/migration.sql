-- Add reconcileType to CustomerReconciliation
ALTER TABLE "CustomerReconciliation" ADD COLUMN "reconcileType" TEXT NOT NULL DEFAULT 'BOTH';

-- Add new fields to ChannelReconciliation
ALTER TABLE "ChannelReconciliation" ADD COLUMN "autoCreated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "totalPeriods" INTEGER;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "periodType" TEXT;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "fixedFeeTotal" REAL;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "commissionTotal" REAL;

-- Create ChannelReconciliationPeriod table
CREATE TABLE "ChannelReconciliationPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reconciliationId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "periodLabel" TEXT,
    "fixedFeeAmount" REAL,
    "commissionAmount" REAL,
    "fixedFeePaidAt" DATETIME,
    "commissionPaidAt" DATETIME,
    "proofUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelReconciliationPeriod_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "ChannelReconciliation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ChannelReconciliationPeriod_reconciliationId_idx" ON "ChannelReconciliationPeriod"("reconciliationId");
CREATE UNIQUE INDEX "ChannelReconciliationPeriod_reconciliationId_periodIndex_key" ON "ChannelReconciliationPeriod"("reconciliationId", "periodIndex");
