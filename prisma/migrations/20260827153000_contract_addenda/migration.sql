CREATE TABLE "ContractAddendum" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "terms" TEXT,
    "effectiveAt" DATETIME,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractAddendum_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractAddendum_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ContractAddendum_contractId_createdAt_idx" ON "ContractAddendum"("contractId", "createdAt");
CREATE INDEX "ContractAddendum_uploadedById_idx" ON "ContractAddendum"("uploadedById");
