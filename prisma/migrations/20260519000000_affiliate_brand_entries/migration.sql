-- AlterTable: add brandEntries to Affiliate
ALTER TABLE "Affiliate" ADD COLUMN "brandEntries" TEXT NOT NULL DEFAULT '[]';
