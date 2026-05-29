-- Add GMV baseline for EXCESS commission mode (manually entered per month).
-- Non-destructive: ADD COLUMN only.

ALTER TABLE "CustomerReconciliation" ADD COLUMN "gmvBaseline" REAL;
