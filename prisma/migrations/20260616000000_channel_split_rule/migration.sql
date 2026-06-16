-- Channel Split Rule: add per-customer split rule config + link from ChannelReconciliation
-- Pure additive: no DROP, no DELETE, no data backfill required.

-- Table 1: ChannelSplitRule (1 customer : 1 rule)
CREATE TABLE "ChannelSplitRule" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "customerId"     TEXT NOT NULL,
    "ruleType"       TEXT NOT NULL,
    "splitEndDate"   DATETIME NOT NULL,
    "fixedFeeRate"   REAL NOT NULL,
    "commissionRate" REAL,
    "tieredRules"    TEXT NOT NULL DEFAULT '[]',
    "createdById"    TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL,
    CONSTRAINT "ChannelSplitRule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ChannelSplitRule_customerId_key" ON "ChannelSplitRule"("customerId");
CREATE INDEX "ChannelSplitRule_customerId_idx" ON "ChannelSplitRule"("customerId");

-- Table 2: extend ChannelReconciliation with splitRuleId (nullable; legacy rows stay NULL)
ALTER TABLE "ChannelReconciliation" ADD COLUMN "splitRuleId" TEXT REFERENCES "ChannelSplitRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ChannelReconciliation_splitRuleId_idx" ON "ChannelReconciliation"("splitRuleId");
