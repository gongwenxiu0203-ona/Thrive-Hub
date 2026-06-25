-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "commissionConfig" TEXT NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "uploadArchiveMode" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "hasSourceAnnotations" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ContractReviewComment" ADD COLUMN "decision" TEXT NOT NULL DEFAULT 'PENDING';
