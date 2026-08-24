-- Additive-only fields for auditable fixed-fee dispute decisions.
ALTER TABLE "CustomerReconciliation" ADD COLUMN "finalFeeAmount" REAL;
ALTER TABLE "ReconciliationReview" ADD COLUMN "disputedFeeAmount" REAL;
