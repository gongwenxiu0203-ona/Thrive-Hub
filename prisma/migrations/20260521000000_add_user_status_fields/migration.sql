-- AddColumn: User.status, User.brandName, User.channelUserId, User.uniqueCode
-- These fields were added to the Prisma schema after the v2 migration that recreated
-- the User table, but no migration file was generated at the time. This migration
-- adds them to any database that ran through the v2 path without these columns.

ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "User" ADD COLUMN "brandName" TEXT;
ALTER TABLE "User" ADD COLUMN "channelUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "uniqueCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_uniqueCode_key" ON "User"("uniqueCode");
