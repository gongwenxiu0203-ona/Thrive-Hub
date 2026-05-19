/*
  Warnings:

  - You are about to drop the column `amazonLink` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `devStatus` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `fbLink` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `flatFeeQuote` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `followers` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `insLink` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `internalName` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `placementQuote` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `platformName` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `sampleSent` on the `Affiliate` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Affiliate` table. All the data in the column will be lost.
  - Added the required column `platformAffiliateName` to the `Affiliate` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "AffiliateCoopReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "platform" TEXT,
    "fee" REAL,
    "blurBrands" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "reviewerId" TEXT,
    "reviewerName" TEXT,
    "customerStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AffiliateCoopReview_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Affiliate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "platformAffiliateName" TEXT NOT NULL,
    "internalAffiliateName" TEXT,
    "source" TEXT,
    "category" TEXT,
    "affiliateType" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "websiteLink" TEXT,
    "websiteTraffic" REAL,
    "websitePlacements" TEXT NOT NULL DEFAULT '[]',
    "websiteNote" TEXT,
    "instagramLink" TEXT,
    "insFollowers" REAL,
    "instagramPlacements" TEXT NOT NULL DEFAULT '[]',
    "insNote" TEXT,
    "facebookLink" TEXT,
    "fbFollowers" REAL,
    "facebookPlacements" TEXT NOT NULL DEFAULT '[]',
    "fbNote" TEXT,
    "youtubeLink" TEXT,
    "youtubeFollowers" REAL,
    "youtubePlacements" TEXT NOT NULL DEFAULT '[]',
    "tiktokLink" TEXT,
    "tiktokFollowers" REAL,
    "tiktokPlacements" TEXT NOT NULL DEFAULT '[]',
    "amazonStorefrontLink" TEXT,
    "topCreator" TEXT,
    "storefrontFlatfee" REAL,
    "storefrontNote" TEXT,
    "ltkLink" TEXT,
    "ltkFlatfee" REAL,
    "pinterestLink" TEXT,
    "pinterestFlatfee" REAL,
    "flatfeeSupplementary" TEXT,
    "note" TEXT,
    "contactInfo" TEXT,
    "developmentStatus" TEXT,
    "developmentDesc" TEXT,
    "contactEmail" TEXT,
    "personInChargeId" TEXT,
    "cooperationMode" TEXT NOT NULL DEFAULT '[]',
    "sampleShipping" TEXT,
    "customerCooperations" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Affiliate_personInChargeId_fkey" FOREIGN KEY ("personInChargeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Affiliate" ("category", "cooperationMode", "createdAt", "id", "source", "tags", "tiktokLink", "updatedAt", "youtubeLink") SELECT "category", coalesce("cooperationMode", '[]') AS "cooperationMode", "createdAt", "id", "source", "tags", "tiktokLink", "updatedAt", "youtubeLink" FROM "Affiliate";
DROP TABLE "Affiliate";
ALTER TABLE "new_Affiliate" RENAME TO "Affiliate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
