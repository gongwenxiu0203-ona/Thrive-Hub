-- CreateTable
CREATE TABLE "BulkOperationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "module" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotJson" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "revertedAt" DATETIME,
    "revertedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BulkOperationLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BulkOperationLog_module_idx" ON "BulkOperationLog"("module");

-- CreateIndex
CREATE INDEX "BulkOperationLog_actionType_idx" ON "BulkOperationLog"("actionType");

-- CreateIndex
CREATE INDEX "BulkOperationLog_operatorId_idx" ON "BulkOperationLog"("operatorId");

-- CreateIndex
CREATE INDEX "BulkOperationLog_createdAt_idx" ON "BulkOperationLog"("createdAt");

-- CreateIndex
CREATE INDEX "BulkOperationLog_revertedAt_idx" ON "BulkOperationLog"("revertedAt");
