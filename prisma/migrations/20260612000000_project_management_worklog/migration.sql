-- 项目管理（整合合作/单次合作）+ 工作日志：三张新表，纯增量

CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'INTEGRATED',
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "customerId" TEXT,
    "contractId" TEXT,
    "demand" TEXT,
    "price" TEXT,
    "coopResult" TEXT,
    "settlementData" TEXT,
    "deletedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Project_customerId_idx" ON "Project"("customerId");
CREATE INDEX "Project_type_idx" ON "Project"("type");
CREATE INDEX "Project_status_idx" ON "Project"("status");

CREATE TABLE "ProjectEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DAILY',
    "content" TEXT NOT NULL,
    "authorId" TEXT,
    "fromWorkLogId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ProjectEntry_projectId_idx" ON "ProjectEntry"("projectId");
CREATE INDEX "ProjectEntry_createdAt_idx" ON "ProjectEntry"("createdAt");

CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'WEEKLY',
    "projectIds" TEXT NOT NULL DEFAULT '[]',
    "workTypes" TEXT NOT NULL DEFAULT '[]',
    "content" TEXT NOT NULL,
    "logDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkLog_authorId_idx" ON "WorkLog"("authorId");
CREATE INDEX "WorkLog_logDate_idx" ON "WorkLog"("logDate");
