-- Approved data-preserving SQLite rebuild. All historical columns are copied
-- verbatim. Never normalize historical zero quantities into unknown values.
-- Run only with the application stopped and a verified fresh backup.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

CREATE TABLE "new_SalesRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "affiliatePlatform" TEXT NOT NULL,
    "affiliateProgram" TEXT,
    "store" TEXT,
    "asin" TEXT,
    "brand" TEXT NOT NULL,
    "affiliateName" TEXT NOT NULL,
    "publisherId" TEXT,
    "publisherUrl" TEXT,
    "region" TEXT,
    "orderDate" DATETIME NOT NULL,
    "lockDate" DATETIME,
    "lockStatus" TEXT,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "unitsSold" INTEGER,
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
    "conversionRate" REAL,
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
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SalesBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_SalesRecord" (
    "id", "batchId", "affiliatePlatform", "affiliateProgram", "store", "asin", "brand", "affiliateName", "region", "orderDate",
    "orders", "unitsSold", "revenue", "commission", "commissionRate", "platformFee", "totalFee", "affiliateFlatfee", "platformFlatfee", "sampleFee",
    "clicks", "addToCarts", "conversionRate", "epc", "acos", "campaignIdName", "campaignSubtitle", "campaignStartDate", "campaignEndDate", "campaignBudget",
    "parentAsin", "storeProductLabel", "affiliateType", "internalAffiliateName", "revenueMoM", "revenueYoY", "promotionLink", "customerId", "deletedAt", "createdAt"
)
SELECT
    "id", "batchId", "affiliatePlatform", "affiliateProgram", "store", "asin", "brand", "affiliateName", "region", "orderDate",
    "orders", "unitsSold", "revenue", "commission", "commissionRate", "platformFee", "totalFee", "affiliateFlatfee", "platformFlatfee", "sampleFee",
    "clicks", "addToCarts", "conversionRate", "epc", "acos", "campaignIdName", "campaignSubtitle", "campaignStartDate", "campaignEndDate", "campaignBudget",
    "parentAsin", "storeProductLabel", "affiliateType", "internalAffiliateName", "revenueMoM", "revenueYoY", "promotionLink", "customerId", "deletedAt", "createdAt"
FROM "SalesRecord";

DROP TABLE "SalesRecord";
ALTER TABLE "new_SalesRecord" RENAME TO "SalesRecord";
CREATE INDEX "SalesRecord_affiliatePlatform_idx" ON "SalesRecord"("affiliatePlatform");
CREATE INDEX "SalesRecord_affiliatePlatform_publisherId_idx" ON "SalesRecord"("affiliatePlatform", "publisherId");
CREATE INDEX "SalesRecord_brand_idx" ON "SalesRecord"("brand");
CREATE INDEX "SalesRecord_region_idx" ON "SalesRecord"("region");
CREATE INDEX "SalesRecord_orderDate_idx" ON "SalesRecord"("orderDate");
CREATE INDEX "SalesRecord_deletedAt_idx" ON "SalesRecord"("deletedAt");

COMMIT;
PRAGMA foreign_keys=ON;
