-- AlterTable
ALTER TABLE "SalesRecord" ADD COLUMN "deletedAt" DATETIME;

-- CreateIndex
CREATE INDEX "SalesRecord_deletedAt_idx" ON "SalesRecord"("deletedAt");
