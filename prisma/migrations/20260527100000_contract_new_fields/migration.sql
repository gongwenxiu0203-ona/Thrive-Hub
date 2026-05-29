-- Add new contract fields: feeCurrency, paymentMethod, commissionType,
-- tieredCommission, hasBet, betTarget, betTargetCurrency
-- Non-destructive: ADD COLUMN only, no existing data is affected.

ALTER TABLE "Contract" ADD COLUMN "feeCurrency" TEXT;
ALTER TABLE "Contract" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Contract" ADD COLUMN "commissionType" TEXT;
ALTER TABLE "Contract" ADD COLUMN "tieredCommission" TEXT;
ALTER TABLE "Contract" ADD COLUMN "hasBet" TEXT NOT NULL DEFAULT 'false';
ALTER TABLE "Contract" ADD COLUMN "betTarget" TEXT;
ALTER TABLE "Contract" ADD COLUMN "betTargetCurrency" TEXT;
