-- Contract templates + versioning + party B / template / stamping fields.
-- Pure additive: no DROP, no DELETE, no data backfill.

-- Table 1: ContractTemplate (admin-uploaded .docx templates)
CREATE TABLE "ContractTemplate" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "name"         TEXT NOT NULL,
    "templateKey"  TEXT NOT NULL,
    "fileUrl"      TEXT NOT NULL,
    "description"  TEXT,
    "uploadedById" TEXT NOT NULL,
    "deletedAt"    DATETIME,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "ContractTemplate_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ContractTemplate_templateKey_idx" ON "ContractTemplate"("templateKey");
CREATE INDEX "ContractTemplate_deletedAt_idx" ON "ContractTemplate"("deletedAt");

-- Table 2: ContractVersion (one row per generate / re-upload / stamp archive)
CREATE TABLE "ContractVersion" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "contractId"  TEXT NOT NULL,
    "versionNo"   INTEGER NOT NULL,
    "fileUrl"     TEXT NOT NULL,
    "fileType"    TEXT NOT NULL DEFAULT 'docx',
    "reason"      TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ContractVersion_contractId_idx" ON "ContractVersion"("contractId");
CREATE UNIQUE INDEX "ContractVersion_contractId_versionNo_key" ON "ContractVersion"("contractId","versionNo");

-- Contract: add party B + template + stamping fields (all nullable / defaulted; legacy rows untouched)
ALTER TABLE "Contract" ADD COLUMN "partyBCompany"       TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyBCreditCode"    TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyBLegalRep"      TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyBAddress"       TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyBContact"       TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyBPhone"         TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyBEmail"         TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyBBankAccounts"  TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Contract" ADD COLUMN "templateId"          TEXT REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD COLUMN "specialCommissionTerms" TEXT;
ALTER TABLE "Contract" ADD COLUMN "stampedDocUrl"       TEXT;
ALTER TABLE "Contract" ADD COLUMN "stampStatus"         TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Contract" ADD COLUMN "pendingNewUpload"    BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Contract_templateId_idx" ON "Contract"("templateId");
