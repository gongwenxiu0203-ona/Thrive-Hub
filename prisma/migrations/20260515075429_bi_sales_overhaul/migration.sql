/*
  Warnings:

  - You are about to drop the column `salesAmount` on the `SalesRecord` table. All the data in the column will be lost.
  - You are about to drop the column `salesQty` on the `SalesRecord` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "AsinMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "storeProductLabel" TEXT,
    "parentAsin" TEXT,
    "asin" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SalesBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "customerId" TEXT,
    "affiliatePlatform" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "uploaderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesBatch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesBatch_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SalesBatch" ("createdAt", "fileName", "id", "recordCount", "uploaderId") SELECT "createdAt", "fileName", "id", "recordCount", "uploaderId" FROM "SalesBatch";
DROP TABLE "SalesBatch";
ALTER TABLE "new_SalesBatch" RENAME TO "SalesBatch";
CREATE TABLE "new_SalesRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "affiliatePlatform" TEXT NOT NULL,
    "affiliateProgram" TEXT,
    "store" TEXT,
    "asin" TEXT,
    "brand" TEXT NOT NULL,
    "affiliateName" TEXT NOT NULL,
    "region" TEXT,
    "orderDate" DATETIME NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "revenue" REAL NOT NULL DEFAULT 0,
    "commission" REAL NOT NULL DEFAULT 0,
    "commissionRate" REAL NOT NULL DEFAULT 0,
    "platformFee" REAL NOT NULL DEFAULT 0,
    "totalFee" REAL NOT NULL DEFAULT 0,
    "affiliateFlatfee" REAL NOT NULL DEFAULT 0,
    "platformFlatfee" REAL NOT NULL DEFAULT 0,
    "sampleFee" REAL NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "addToCarts" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" REAL NOT NULL DEFAULT 0,
    "epc" REAL NOT NULL DEFAULT 0,
    "acos" REAL NOT NULL DEFAULT 0,
    "campaignIdName" TEXT,
    "campaignSubtitle" TEXT,
    "campaignStartDate" DATETIME,
    "campaignEndDate" DATETIME,
    "campaignBudget" REAL DEFAULT 0,
    "parentAsin" TEXT,
    "storeProductLabel" TEXT,
    "affiliateType" TEXT,
    "internalAffiliateName" TEXT,
    "revenueMoM" REAL NOT NULL DEFAULT 0,
    "revenueYoY" REAL NOT NULL DEFAULT 0,
    "promotionLink" TEXT,
    "customerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SalesBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SalesRecord" ("affiliateName", "affiliatePlatform", "affiliateProgram", "asin", "batchId", "brand", "commission", "commissionRate", "createdAt", "id", "orderDate", "region") SELECT "affiliateName", "affiliatePlatform", "affiliateProgram", "asin", "batchId", "brand", "commission", "commissionRate", "createdAt", "id", "orderDate", "region" FROM "SalesRecord";
DROP TABLE "SalesRecord";
ALTER TABLE "new_SalesRecord" RENAME TO "SalesRecord";
CREATE INDEX "SalesRecord_affiliatePlatform_idx" ON "SalesRecord"("affiliatePlatform");
CREATE INDEX "SalesRecord_brand_idx" ON "SalesRecord"("brand");
CREATE INDEX "SalesRecord_region_idx" ON "SalesRecord"("region");
CREATE INDEX "SalesRecord_orderDate_idx" ON "SalesRecord"("orderDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AsinMapping_asin_idx" ON "AsinMapping"("asin");

-- CreateIndex
CREATE UNIQUE INDEX "AsinMapping_brand_store_region_asin_key" ON "AsinMapping"("brand", "store", "region", "asin");
