-- CreateTable: 联盟商对账记录
CREATE TABLE "AffiliateReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "affiliateName" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "cooperationMode" TEXT NOT NULL DEFAULT '[]',
    "platforms" TEXT NOT NULL DEFAULT '[]',
    "coopReviewId" TEXT,
    "submitterId" TEXT,
    "promotionAsin" TEXT,
    "paymentMethod" TEXT,
    "paymentAccountName" TEXT,
    "paymentAccount" TEXT,
    "paymentNote" TEXT,
    "paymentCurrency" TEXT,
    "paymentAmount" REAL,
    "paymentRequestAt" DATETIME,
    "paidAt" DATETIME,
    "transactionNo" TEXT,
    "proofUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AffiliateReconciliation_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AffiliateReconciliation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AffiliateReconciliation_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AffiliateReconciliation_affiliateId_idx" ON "AffiliateReconciliation"("affiliateId");
CREATE INDEX "AffiliateReconciliation_customerId_idx" ON "AffiliateReconciliation"("customerId");
CREATE INDEX "AffiliateReconciliation_submitterId_idx" ON "AffiliateReconciliation"("submitterId");
