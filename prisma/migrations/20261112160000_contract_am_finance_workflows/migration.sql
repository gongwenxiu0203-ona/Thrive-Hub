-- Additive only. Preserve every existing business table and approval step.
BEGIN IMMEDIATE;

CREATE TABLE "FinanceApprovalPolicy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "reviewRequired" BOOLEAN NOT NULL DEFAULT true,
  "defaultReviewerId" TEXT,
  "defaultProcessorId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "FinanceRequestRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "revisionNo" INTEGER NOT NULL,
  "snapshot" TEXT NOT NULL,
  "policySnapshot" TEXT NOT NULL DEFAULT '{}',
  "stepsSnapshot" TEXT NOT NULL DEFAULT '[]',
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ContractAMAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contractId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractAMAssignment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContractAMAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractAMAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ContractAMMonthlyDispatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contractId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "yearMonth" TEXT NOT NULL,
  "reminderId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "FinanceApprovalPolicy_entityType_key" ON "FinanceApprovalPolicy"("entityType");
CREATE UNIQUE INDEX "FinanceRequestRevision_entityType_entityId_revisionNo_key" ON "FinanceRequestRevision"("entityType", "entityId", "revisionNo");
CREATE INDEX "FinanceRequestRevision_entityType_entityId_createdAt_idx" ON "FinanceRequestRevision"("entityType", "entityId", "createdAt");
CREATE UNIQUE INDEX "ContractAMAssignment_contractId_userId_key" ON "ContractAMAssignment"("contractId", "userId");
CREATE INDEX "ContractAMAssignment_userId_idx" ON "ContractAMAssignment"("userId");
CREATE UNIQUE INDEX "ContractAMMonthlyDispatch_contractId_targetUserId_yearMonth_key" ON "ContractAMMonthlyDispatch"("contractId", "targetUserId", "yearMonth");

COMMIT;
