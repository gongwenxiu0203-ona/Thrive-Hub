-- Add nullable review timestamps. Existing customer data remains intact.
ALTER TABLE "Customer" ADD COLUMN "staleReviewRequestedAt" DATETIME;
ALTER TABLE "Customer" ADD COLUMN "staleReviewDeadlineAt" DATETIME;

-- Normalize retired customer-progress values to the confirmed workflow.
UPDATE "Customer" SET "status" = 'COOPERATING' WHERE "status" = 'CONTRACT_SIGNED';
UPDATE "Customer" SET "status" = 'NOT_ADVANCED' WHERE "status" = 'PENDING';
UPDATE "Customer" SET "status" = 'INTERNAL_DISCUSSION' WHERE "status" = 'CONTRACT_IN_PROGRESS';
