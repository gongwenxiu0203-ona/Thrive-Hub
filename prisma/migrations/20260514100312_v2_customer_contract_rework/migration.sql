/*
  Warnings:

  - You are about to drop the column `betClause` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `fixedFee` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `comment` on the `ContractFieldReview` table. All the data in the column will be lost.
  - You are about to drop the column `bsrScore` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `budget` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `commissionScore` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `mainSite` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `productInfo` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `promotionGoal` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `promotionHistory` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `revenueScore` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `socialMedia` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Task` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `ContractFieldReview` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CHANNEL',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "ownerId" TEXT,
    "reviewerId" TEXT,
    "fileUrl" TEXT,
    "contractText" TEXT,
    "extractedBy" TEXT,
    "partyA" TEXT,
    "accountingPeriod" TEXT,
    "feeCycle" TEXT,
    "feeAmount" TEXT,
    "commissionRate" TEXT,
    "affiliateRule" TEXT,
    "paymentCycle" TEXT,
    "invoiceReq" TEXT,
    "lateLiability" TEXT,
    "remark" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Contract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contract_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("commissionRate", "contractNo", "createdAt", "createdById", "customerId", "endDate", "fileUrl", "id", "startDate", "status", "type", "updatedAt") SELECT "commissionRate", "contractNo", "createdAt", "createdById", "customerId", "endDate", "fileUrl", "id", "startDate", "status", "type", "updatedAt" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE UNIQUE INDEX "Contract_contractNo_key" ON "Contract"("contractNo");
CREATE TABLE "new_ContractFieldReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'APPROVED',
    "modification" TEXT,
    "reviewerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractFieldReview_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractFieldReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ContractFieldReview" ("contractId", "createdAt", "decision", "fieldName", "id", "reviewerId") SELECT "contractId", "createdAt", "decision", "fieldName", "id", "reviewerId" FROM "ContractFieldReview";
DROP TABLE "ContractFieldReview";
ALTER TABLE "new_ContractFieldReview" RENAME TO "ContractFieldReview";
CREATE UNIQUE INDEX "ContractFieldReview_contractId_fieldName_key" ON "ContractFieldReview"("contractId", "fieldName");
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandName" TEXT NOT NULL,
    "mainSites" TEXT NOT NULL DEFAULT '[]',
    "siteLinks" TEXT NOT NULL DEFAULT '{}',
    "competitor" TEXT,
    "targetPlatforms" TEXT NOT NULL DEFAULT '[]',
    "platformGmv" TEXT NOT NULL DEFAULT '{}',
    "amazonAcos" TEXT,
    "socialMediaInfo" TEXT,
    "affiliateHistory" TEXT,
    "affiliatePlatforms" TEXT,
    "promotionGoals" TEXT NOT NULL DEFAULT '[]',
    "targetGmv" TEXT,
    "channelBudget" TEXT,
    "affiliateTeam" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "statusChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" TEXT NOT NULL DEFAULT 'PENDING',
    "businessOwnerId" TEXT,
    "backendOwnerId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'INTERNAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_businessOwnerId_fkey" FOREIGN KEY ("businessOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Customer_backendOwnerId_fkey" FOREIGN KEY ("backendOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Customer" ("backendOwnerId", "brandName", "businessOwnerId", "contactEmail", "contactName", "contactPhone", "createdAt", "id", "rating", "source", "status", "targetPlatforms", "updatedAt") SELECT "backendOwnerId", "brandName", "businessOwnerId", "contactEmail", "contactName", "contactPhone", "createdAt", "id", "rating", "source", "status", "targetPlatforms", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "customerId" TEXT,
    "contractId" TEXT,
    "ownerId" TEXT,
    "publisherId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MID',
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "returnReason" TEXT,
    "meetingTime" DATETIME,
    "meetingMode" TEXT,
    "meetingLocation" TEXT,
    "attendees" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("createdAt", "customerId", "description", "dueDate", "id", "ownerId", "priority", "publisherId", "sortOrder", "status", "title", "updatedAt") SELECT "createdAt", "customerId", "description", "dueDate", "id", "ownerId", "priority", "publisherId", "sortOrder", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "feishuAuth" BOOLEAN NOT NULL DEFAULT false,
    "googleAuth" BOOLEAN NOT NULL DEFAULT false,
    "emailAuth" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "role") SELECT "createdAt", "email", "id", "name", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
