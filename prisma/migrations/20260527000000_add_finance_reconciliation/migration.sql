-- Migration: add_finance_reconciliation
-- Adds 4 new tables for the finance reconciliation module.
-- All are brand-new tables — no existing tables are modified.

-- 客户对账记录
CREATE TABLE "CustomerReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "partyA" TEXT,
    "accountingPeriod" TEXT,
    "feeCycle" TEXT,
    "feeAmount" REAL NOT NULL DEFAULT 0,
    "commissionRate" REAL NOT NULL DEFAULT 0,
    "affiliateRule" TEXT,
    "paymentCycle" TEXT,
    "betType" TEXT NOT NULL DEFAULT 'NONE',
    "betOrderCount" INTEGER,
    "betSalesAmount" REAL,
    "actualOrders" INTEGER NOT NULL DEFAULT 0,
    "actualSalesAmount" REAL NOT NULL DEFAULT 0,
    "betResult" TEXT,
    "actualCommissionRate" REAL NOT NULL DEFAULT 0,
    "commissionAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT,
    "submittedAt" DATETIME,
    "finalOrders" INTEGER,
    "finalSalesAmount" REAL,
    "finalCommissionAmount" REAL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerReconciliation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerReconciliation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerReconciliation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerReconciliation_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CustomerReconciliation_customerId_idx" ON "CustomerReconciliation"("customerId");
CREATE INDEX "CustomerReconciliation_contractId_idx" ON "CustomerReconciliation"("contractId");
CREATE INDEX "CustomerReconciliation_status_idx" ON "CustomerReconciliation"("status");

-- 对账审核/争议记录
CREATE TABLE "ReconciliationReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reconciliationId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "disputedOrders" INTEGER,
    "disputedSalesAmount" REAL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReconciliationReview_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CustomerReconciliation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReconciliationReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ReconciliationReview_reconciliationId_idx" ON "ReconciliationReview"("reconciliationId");

-- 结算跟踪
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reconciliationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "estimatedDate" DATETIME,
    "actualDate" DATETIME,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settlement_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CustomerReconciliation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Settlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Settlement_reconciliationId_idx" ON "Settlement"("reconciliationId");
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- 渠道商分账记录
CREATE TABLE "ChannelReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "channelUserId" TEXT NOT NULL,
    "fixedFeeShareRate" REAL NOT NULL DEFAULT 0,
    "fixedFeeSharePerPeriod" REAL NOT NULL DEFAULT 0,
    "fixedFeeSharePeriods" INTEGER NOT NULL DEFAULT 1,
    "fixedFeeShareTotal" REAL NOT NULL DEFAULT 0,
    "commissionShareRate" REAL NOT NULL DEFAULT 0,
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
    CONSTRAINT "ChannelReconciliation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChannelReconciliation_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChannelReconciliation_channelUserId_fkey" FOREIGN KEY ("channelUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChannelReconciliation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ChannelReconciliation_customerId_idx" ON "ChannelReconciliation"("customerId");
CREATE INDEX "ChannelReconciliation_channelUserId_idx" ON "ChannelReconciliation"("channelUserId");
