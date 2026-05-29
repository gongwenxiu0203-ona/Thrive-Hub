-- Fix: Make settlementId nullable in ChannelReconciliation.
-- SQLite does not support ALTER COLUMN, so we recreate the table.
-- This migration is safe: ChannelReconciliation has no dependents.

PRAGMA foreign_keys=OFF;

CREATE TABLE "ChannelReconciliation_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "contractId" TEXT,
    "customerReconciliationId" TEXT,
    "settlementId" TEXT,
    "channelUserId" TEXT NOT NULL,
    "periodNo" INTEGER NOT NULL DEFAULT 1,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "fixedFeeReceived" REAL,
    "fixedFeeShareRate" REAL NOT NULL DEFAULT 0,
    "fixedFeeShareAmount" REAL NOT NULL DEFAULT 0,
    "fixedFeeShareCurrency" TEXT NOT NULL DEFAULT '人民币',
    "fixedFeeEstimatedDate" DATETIME,
    "fixedFeeActualDate" DATETIME,
    "fixedFeeProofUrl" TEXT,
    "fixedFeePushedToChannel" BOOLEAN NOT NULL DEFAULT false,
    "commissionReceived" REAL,
    "commissionShareRate" REAL NOT NULL DEFAULT 0,
    "commissionShareAmount" REAL NOT NULL DEFAULT 0,
    "commissionShareCurrency" TEXT NOT NULL DEFAULT '人民币',
    "commissionEstimatedDate" DATETIME,
    "commissionActualDate" DATETIME,
    "commissionProofUrl" TEXT,
    "commissionPushedToChannel" BOOLEAN NOT NULL DEFAULT false,
    "fixedFeeSharePerPeriod" REAL NOT NULL DEFAULT 0,
    "fixedFeeSharePeriods" INTEGER NOT NULL DEFAULT 1,
    "fixedFeeShareTotal" REAL NOT NULL DEFAULT 0,
    "commissionSharePerPeriod" REAL NOT NULL DEFAULT 0,
    "commissionSharePeriods" INTEGER NOT NULL DEFAULT 1,
    "commissionShareTotal" REAL NOT NULL DEFAULT 0,
    "totalShareAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "estimatedDate" DATETIME,
    "actualDate" DATETIME,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelReconciliation_new_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChannelReconciliation_new_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChannelReconciliation_new_channelUserId_fkey" FOREIGN KEY ("channelUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChannelReconciliation_new_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "ChannelReconciliation_new" SELECT
    "id", "customerId", "contractId", "customerReconciliationId", "settlementId",
    "channelUserId", "periodNo", "periodStart", "periodEnd",
    "fixedFeeReceived", "fixedFeeShareRate", "fixedFeeShareAmount", "fixedFeeShareCurrency",
    "fixedFeeEstimatedDate", "fixedFeeActualDate", "fixedFeeProofUrl", "fixedFeePushedToChannel",
    "commissionReceived", "commissionShareRate", "commissionShareAmount", "commissionShareCurrency",
    "commissionEstimatedDate", "commissionActualDate", "commissionProofUrl", "commissionPushedToChannel",
    "fixedFeeSharePerPeriod", "fixedFeeSharePeriods", "fixedFeeShareTotal",
    "commissionSharePerPeriod", "commissionSharePeriods", "commissionShareTotal",
    "totalShareAmount", "status", "estimatedDate", "actualDate", "note",
    "createdById", "createdAt", "updatedAt"
FROM "ChannelReconciliation";

DROP TABLE "ChannelReconciliation";
ALTER TABLE "ChannelReconciliation_new" RENAME TO "ChannelReconciliation";

CREATE INDEX "ChannelReconciliation_customerId_idx" ON "ChannelReconciliation"("customerId");
CREATE INDEX "ChannelReconciliation_channelUserId_idx" ON "ChannelReconciliation"("channelUserId");
CREATE INDEX "ChannelReconciliation_customerReconciliationId_idx" ON "ChannelReconciliation"("customerReconciliationId");
CREATE INDEX "ChannelReconciliation_periodStart_idx" ON "ChannelReconciliation"("periodStart");

PRAGMA foreign_keys=ON;
