-- CreateTable
CREATE TABLE "CustomerAuthorizationInfo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountInfo" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerAuthorizationInfo_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerAuthorizationInfo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CustomerAuthorizationInfo_customerId_idx" ON "CustomerAuthorizationInfo"("customerId");

-- CreateIndex
CREATE INDEX "CustomerAuthorizationInfo_createdById_idx" ON "CustomerAuthorizationInfo"("createdById");
