-- Additive only: existing business rows and BI data are not rewritten.
BEGIN IMMEDIATE;
CREATE TABLE "FeishuBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTestAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FeishuBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FeishuBinding_userId_key" ON "FeishuBinding"("userId");
CREATE UNIQUE INDEX "FeishuBinding_appId_tenantKey_openId_key" ON "FeishuBinding"("appId", "tenantKey", "openId");

CREATE TABLE "FeishuNotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" DATETIME,
    "leaseToken" TEXT,
    "lastError" TEXT,
    "sentAt" DATETIME,
    "messageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FeishuNotificationDelivery_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "FeishuBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeishuNotificationDelivery_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FeishuNotificationDelivery_bindingId_reminderId_key" ON "FeishuNotificationDelivery"("bindingId", "reminderId");
CREATE INDEX "FeishuNotificationDelivery_status_nextAttemptAt_idx" ON "FeishuNotificationDelivery"("status", "nextAttemptAt");
COMMIT;
