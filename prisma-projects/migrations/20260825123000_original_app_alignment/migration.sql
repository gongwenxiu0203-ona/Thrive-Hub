ALTER TABLE "ProjectKpi" ADD COLUMN "amOwnerId" TEXT;

ALTER TABLE "ProjectSourceFile" ADD COLUMN "dataMonth" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProjectSourceFile" ADD COLUMN "projectCurrency" TEXT;
ALTER TABLE "ProjectSourceFile" ADD COLUMN "originalAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "ProjectSourceFile" ADD COLUMN "detectedCurrency" TEXT;

CREATE TABLE "ProjectDataSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sourceUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ProjectDataSource_code_key" ON "ProjectDataSource"("code");

CREATE TABLE "ProjectMonthlySalesSummary" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "dataMonth" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "totalAmount" REAL NOT NULL DEFAULT 0,
  "platformBreakdown" TEXT NOT NULL DEFAULT '{}',
  "exchangeRates" TEXT NOT NULL DEFAULT '{}',
  "calculationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ProjectMonthlySalesSummary_projectId_dataMonth_key" ON "ProjectMonthlySalesSummary"("projectId", "dataMonth");
CREATE INDEX "ProjectMonthlySalesSummary_dataMonth_idx" ON "ProjectMonthlySalesSummary"("dataMonth");

ALTER TABLE "ProjectDiscountSource" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "appToken" TEXT;
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "tableId" TEXT;
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "viewId" TEXT;
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "headerRowIndex" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT 'IDLE';
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "lastSyncAt" DATETIME;
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "lastSyncCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "syncError" TEXT;
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "lastOperatedById" TEXT;
ALTER TABLE "ProjectDiscountSource" ADD COLUMN "lastOperatedAt" DATETIME;

CREATE TABLE "ProjectDiscountFieldMapping" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "targetField" TEXT NOT NULL,
  "sourceField" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ProjectDiscountFieldMapping_sourceId_targetField_key" ON "ProjectDiscountFieldMapping"("sourceId", "targetField");
CREATE INDEX "ProjectDiscountFieldMapping_sourceId_idx" ON "ProjectDiscountFieldMapping"("sourceId");

ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "salesType" TEXT;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "productCategory" TEXT;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "asin" TEXT;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "productLink" TEXT;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "originalPrice" REAL;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "discountPrice" REAL;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "discountRate" REAL;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "endDate" DATETIME;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "promoCode" TEXT;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "accCampaignId" TEXT;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "accGoldRatio" REAL;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "lastUpdated" DATETIME;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "activityStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "dealType" TEXT;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "brand" TEXT;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "platform" TEXT;
ALTER TABLE "ProjectDiscountRecord" ADD COLUMN "store" TEXT;

ALTER TABLE "ProjectProduct" ADD COLUMN "sequence" TEXT;
ALTER TABLE "ProjectProduct" ADD COLUMN "store" TEXT;
ALTER TABLE "ProjectProduct" ADD COLUMN "category" TEXT;
ALTER TABLE "ProjectProduct" ADD COLUMN "platform" TEXT;
ALTER TABLE "ProjectProduct" ADD COLUMN "bsrRank" TEXT;
ALTER TABLE "ProjectProduct" ADD COLUMN "rating" REAL;
ALTER TABLE "ProjectProduct" ADD COLUMN "linkPosition" TEXT;
ALTER TABLE "ProjectProduct" ADD COLUMN "productLink" TEXT;
ALTER TABLE "ProjectProduct" ADD COLUMN "reviewCount" INTEGER;
