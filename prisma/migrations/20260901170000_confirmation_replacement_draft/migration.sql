ALTER TABLE "ContractProjectConfirmation" ADD COLUMN "pendingDetails" TEXT;
ALTER TABLE "ContractProjectConfirmation" ADD COLUMN "pendingSignedFileUrl" TEXT;
ALTER TABLE "ContractProjectConfirmation" ADD COLUMN "pendingVersion" INTEGER NOT NULL DEFAULT 0;
