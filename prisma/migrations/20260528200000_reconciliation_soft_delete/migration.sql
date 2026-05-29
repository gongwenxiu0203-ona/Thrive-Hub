-- Add soft-delete column for CustomerReconciliation (7-day recoverable trash)
-- Non-destructive: ADD COLUMN only.

ALTER TABLE "CustomerReconciliation" ADD COLUMN "deletedAt" DATETIME;

CREATE INDEX "CustomerReconciliation_deletedAt_idx" ON "CustomerReconciliation"("deletedAt");
