CREATE TABLE "ContractLegacyBillingUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "scopeSnapshot" TEXT NOT NULL DEFAULT '{}',
    "termsSnapshot" TEXT NOT NULL DEFAULT '{}',
    "terminatedAt" DATETIME,
    "terminationReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractLegacyBillingUnit_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ContractLegacyBillingUnit_contractId_key_key" ON "ContractLegacyBillingUnit"("contractId", "key");
CREATE INDEX "ContractLegacyBillingUnit_contractId_status_idx" ON "ContractLegacyBillingUnit"("contractId", "status");

ALTER TABLE "CustomerReconciliation" ADD COLUMN "legacyBillingUnitId" TEXT REFERENCES "ContractLegacyBillingUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CustomerReconciliation_legacyBillingUnitId_reconcileType_periodStart_idx" ON "CustomerReconciliation"("legacyBillingUnitId", "reconcileType", "periodStart");
