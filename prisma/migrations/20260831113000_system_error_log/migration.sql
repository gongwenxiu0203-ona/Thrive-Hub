CREATE TABLE "SystemErrorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "technicalDetails" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "SystemErrorLog_traceCode_key" ON "SystemErrorLog"("traceCode");
CREATE INDEX "SystemErrorLog_createdAt_idx" ON "SystemErrorLog"("createdAt");
CREATE INDEX "SystemErrorLog_module_createdAt_idx" ON "SystemErrorLog"("module", "createdAt");
CREATE INDEX "SystemErrorLog_status_createdAt_idx" ON "SystemErrorLog"("status", "createdAt");
CREATE INDEX "SystemErrorLog_category_createdAt_idx" ON "SystemErrorLog"("category", "createdAt");
