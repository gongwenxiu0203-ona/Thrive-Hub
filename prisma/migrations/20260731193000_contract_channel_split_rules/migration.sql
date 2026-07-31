-- Add contract-scoped channel split rules while preserving all existing customer rules.
ALTER TABLE "ChannelSplitRule" ADD COLUMN "contractId" TEXT REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Replace the old all-row customer uniqueness with scope-aware uniqueness.
DROP INDEX IF EXISTS "ChannelSplitRule_customerId_key";
CREATE UNIQUE INDEX "ChannelSplitRule_customer_level_unique"
ON "ChannelSplitRule"("customerId")
WHERE "contractId" IS NULL;

CREATE UNIQUE INDEX "ChannelSplitRule_contractId_key"
ON "ChannelSplitRule"("contractId");
CREATE INDEX "ChannelSplitRule_contractId_idx"
ON "ChannelSplitRule"("contractId");