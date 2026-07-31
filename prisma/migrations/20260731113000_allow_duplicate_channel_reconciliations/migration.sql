-- Allow duplicate rule-driven channel reconciliations and add recoverable deletion metadata.
-- Existing business records are unchanged.
DROP INDEX IF EXISTS "ChannelReconciliation_rule_driven_customer_unique";
ALTER TABLE "ChannelReconciliation" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "ChannelReconciliation" ADD COLUMN "deletionReason" TEXT;
