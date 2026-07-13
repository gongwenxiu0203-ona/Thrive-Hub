CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX "AdminAuditLog_actorId_idx" ON "AdminAuditLog"("actorId");
CREATE INDEX "AdminAuditLog_module_idx" ON "AdminAuditLog"("module");
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

CREATE TABLE "ApiAccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiAccessLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ApiAccessLog_createdAt_idx" ON "ApiAccessLog"("createdAt");
CREATE INDEX "ApiAccessLog_actorId_idx" ON "ApiAccessLog"("actorId");
CREATE INDEX "ApiAccessLog_route_idx" ON "ApiAccessLog"("route");
CREATE INDEX "ApiAccessLog_outcome_idx" ON "ApiAccessLog"("outcome");
