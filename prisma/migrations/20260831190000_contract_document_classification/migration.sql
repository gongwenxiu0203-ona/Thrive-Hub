-- Additive compatibility fields for contract documents, project ownership and contact data.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "FinanceAccountProfile" ADD COLUMN "legalEntityKey" TEXT;
ALTER TABLE "ContractTemplate" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'BRAND_LEGACY';
ALTER TABLE "Project" ADD COLUMN "projectConfirmationId" TEXT REFERENCES "ContractProjectConfirmation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FinanceAccountProfile_accountType_legalEntityKey_status_idx"
  ON "FinanceAccountProfile"("accountType", "legalEntityKey", "status");
CREATE INDEX "ContractTemplate_documentType_deletedAt_idx"
  ON "ContractTemplate"("documentType", "deletedAt");
CREATE INDEX "Project_projectConfirmationId_idx"
  ON "Project"("projectConfirmationId");
