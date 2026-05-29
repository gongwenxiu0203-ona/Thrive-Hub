-- Add currency, submit-target, deadline, and 7-day reminder flag to CustomerReconciliation
-- Non-destructive: ADD COLUMN only.

ALTER TABLE "CustomerReconciliation" ADD COLUMN "fixedFeeCurrency" TEXT NOT NULL DEFAULT '人民币';
ALTER TABLE "CustomerReconciliation" ADD COLUMN "commissionCurrency" TEXT NOT NULL DEFAULT '人民币';
ALTER TABLE "CustomerReconciliation" ADD COLUMN "submittedToUserId" TEXT;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "submittedDeadline" DATETIME;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "settlementReminderSent" BOOLEAN NOT NULL DEFAULT false;
