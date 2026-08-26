CREATE TABLE "ProjectDiscountReminderSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "targetUserIds" TEXT NOT NULL DEFAULT '[]',
    "remindBeforeEndDays" INTEGER NOT NULL DEFAULT 3,
    "notifySyncFailure" BOOLEAN NOT NULL DEFAULT true,
    "scheduleTime" TEXT NOT NULL DEFAULT '09:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "planVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectDiscountReminderSetting_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProjectDiscountSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectDiscountReminderRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "settingId" TEXT NOT NULL,
    "scheduleDate" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "targetUserIds" TEXT NOT NULL DEFAULT '[]',
    "reminderIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectDiscountReminderRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProjectDiscountSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectDiscountReminderRun_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "ProjectDiscountReminderSetting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectDiscountReminderSetting_projectId_sourceId_key" ON "ProjectDiscountReminderSetting"("projectId", "sourceId");
CREATE INDEX "ProjectDiscountReminderSetting_enabled_scheduleTime_idx" ON "ProjectDiscountReminderSetting"("enabled", "scheduleTime");
CREATE UNIQUE INDEX "ProjectDiscountReminderRun_projectId_sourceId_scheduleDate_planVersion_eventType_key" ON "ProjectDiscountReminderRun"("projectId", "sourceId", "scheduleDate", "planVersion", "eventType");
CREATE INDEX "ProjectDiscountReminderRun_status_scheduleDate_idx" ON "ProjectDiscountReminderRun"("status", "scheduleDate");
CREATE INDEX "ProjectDiscountReminderRun_settingId_idx" ON "ProjectDiscountReminderRun"("settingId");
