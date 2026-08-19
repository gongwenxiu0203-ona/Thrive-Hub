-- CreateTable
CREATE TABLE "EmailReplySetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "replyToUserId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailReplySetting_replyToUserId_fkey" FOREIGN KEY ("replyToUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailReplySetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailDeliveryLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventKey" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "replyToEmail" TEXT,
    "businessType" TEXT,
    "businessId" TEXT,
    "providerMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorSummary" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailDeliveryLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailReplySetting_category_key" ON "EmailReplySetting"("category");
CREATE INDEX "EmailReplySetting_replyToUserId_idx" ON "EmailReplySetting"("replyToUserId");
CREATE INDEX "EmailReplySetting_updatedById_idx" ON "EmailReplySetting"("updatedById");
CREATE UNIQUE INDEX "EmailDeliveryLog_idempotencyKey_key" ON "EmailDeliveryLog"("idempotencyKey");
CREATE INDEX "EmailDeliveryLog_eventKey_idx" ON "EmailDeliveryLog"("eventKey");
CREATE INDEX "EmailDeliveryLog_recipientEmail_idx" ON "EmailDeliveryLog"("recipientEmail");
CREATE INDEX "EmailDeliveryLog_businessType_businessId_idx" ON "EmailDeliveryLog"("businessType", "businessId");
CREATE INDEX "EmailDeliveryLog_providerMessageId_idx" ON "EmailDeliveryLog"("providerMessageId");
CREATE INDEX "EmailDeliveryLog_status_idx" ON "EmailDeliveryLog"("status");
CREATE INDEX "EmailDeliveryLog_createdAt_idx" ON "EmailDeliveryLog"("createdAt");
