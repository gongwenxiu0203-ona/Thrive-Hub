-- Additive framework/SOW foundation. Existing rows remain legacy (NULL).
ALTER TABLE "Contract" ADD COLUMN "contractMode" TEXT;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "projectConfirmationId" TEXT REFERENCES "ContractProjectConfirmation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "ruleSnapshot" TEXT;
ALTER TABLE "CustomerReconciliation" ADD COLUMN "confirmedCommissionRate" REAL;
ALTER TABLE "InvoiceItem" ADD COLUMN "projectConfirmationId" TEXT REFERENCES "ContractProjectConfirmation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualBillingRequestItem" ADD COLUMN "projectConfirmationId" TEXT REFERENCES "ContractProjectConfirmation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRequestLine" ADD COLUMN "projectConfirmationId" TEXT REFERENCES "ContractProjectConfirmation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ContractProjectConfirmation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contractId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "startDate" DATETIME,
  "endDate" DATETIME,
  "effectiveAt" DATETIME,
  "terminatedAt" DATETIME,
  "signedFileUrl" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "details" TEXT NOT NULL DEFAULT '{}',
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "contractId_Contract_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ContractConfirmationVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "confirmationId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "confirmationId_ContractProjectConfirmation_fkey" FOREIGN KEY ("confirmationId") REFERENCES "ContractProjectConfirmation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ContractConfirmationScope" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "confirmationId" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "salesPlatforms" TEXT NOT NULL DEFAULT '[]',
  "programs" TEXT NOT NULL DEFAULT '[]',
  "thirdPartyPlatforms" TEXT NOT NULL DEFAULT '[]',
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "confirmationId_ContractProjectConfirmation_fkey" FOREIGN KEY ("confirmationId") REFERENCES "ContractProjectConfirmation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ContractReceivingAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contractId" TEXT NOT NULL,
  "financeProfileId" TEXT,
  "snapshot" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contractId_Contract_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ContractCustomOption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "category" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ContractOrderAttribution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "storeKey" TEXT NOT NULL,
  "orderKey" TEXT NOT NULL,
  "confirmationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "confirmationId_ContractProjectConfirmation_fkey" FOREIGN KEY ("confirmationId") REFERENCES "ContractProjectConfirmation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ContractProjectConfirmation_number_key" ON "ContractProjectConfirmation"("number");
CREATE INDEX "ContractProjectConfirmation_contractId_status_idx" ON "ContractProjectConfirmation"("contractId", "status");
CREATE UNIQUE INDEX "ContractConfirmationVersion_confirmationId_version_key" ON "ContractConfirmationVersion"("confirmationId", "version");
CREATE INDEX "ContractConfirmationScope_confirmationId_position_idx" ON "ContractConfirmationScope"("confirmationId", "position");
CREATE INDEX "ContractReceivingAccount_contractId_position_idx" ON "ContractReceivingAccount"("contractId", "position");
CREATE UNIQUE INDEX "ContractCustomOption_category_normalizedValue_key" ON "ContractCustomOption"("category", "normalizedValue");
CREATE UNIQUE INDEX "ContractOrderAttribution_customerId_platform_storeKey_orderKey_key" ON "ContractOrderAttribution"("customerId", "platform", "storeKey", "orderKey");
CREATE INDEX "ContractOrderAttribution_confirmationId_idx" ON "ContractOrderAttribution"("confirmationId");
CREATE INDEX "CustomerReconciliation_projectConfirmationId_reconcileType_periodStart_idx" ON "CustomerReconciliation"("projectConfirmationId", "reconcileType", "periodStart");
CREATE INDEX "InvoiceItem_projectConfirmationId_idx" ON "InvoiceItem"("projectConfirmationId");
CREATE INDEX "ManualBillingRequestItem_projectConfirmationId_idx" ON "ManualBillingRequestItem"("projectConfirmationId");
CREATE INDEX "BillingRequestLine_projectConfirmationId_idx" ON "BillingRequestLine"("projectConfirmationId");
