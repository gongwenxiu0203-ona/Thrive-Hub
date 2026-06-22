-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "uploadType" TEXT;

-- CreateTable
CREATE TABLE "ContractReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractReview_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractAnnotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractAnnotation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractAnnotation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ContractVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractReviewComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "annotationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractReviewComment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ContractReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractReviewComment_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "ContractAnnotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ContractReview_contractId_idx" ON "ContractReview"("contractId");

-- CreateIndex
CREATE INDEX "ContractReview_status_idx" ON "ContractReview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractReview_contractId_round_key" ON "ContractReview"("contractId", "round");

-- CreateIndex
CREATE INDEX "ContractAnnotation_contractId_idx" ON "ContractAnnotation"("contractId");

-- CreateIndex
CREATE INDEX "ContractAnnotation_versionId_idx" ON "ContractAnnotation"("versionId");

-- CreateIndex
CREATE INDEX "ContractReviewComment_reviewId_idx" ON "ContractReviewComment"("reviewId");
