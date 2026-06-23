-- CreateTable
CREATE TABLE "ProjectGmvTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amOwnerId" TEXT,
    "amRole" TEXT NOT NULL DEFAULT 'AM',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "monthlyTarget" REAL NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectGmvTarget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectGmvTarget_amOwnerId_fkey" FOREIGN KEY ("amOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectGmvTarget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectChannelTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectGmvTargetId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "ownerId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PGM',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sharePercent" REAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectChannelTarget_projectGmvTargetId_fkey" FOREIGN KEY ("projectGmvTargetId") REFERENCES "ProjectGmvTarget" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectChannelTarget_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectGmvTarget_projectId_month_key" ON "ProjectGmvTarget"("projectId", "month");

-- CreateIndex
CREATE INDEX "ProjectGmvTarget_month_idx" ON "ProjectGmvTarget"("month");

-- CreateIndex
CREATE INDEX "ProjectGmvTarget_amOwnerId_idx" ON "ProjectGmvTarget"("amOwnerId");

-- CreateIndex
CREATE INDEX "ProjectChannelTarget_projectGmvTargetId_idx" ON "ProjectChannelTarget"("projectGmvTargetId");
