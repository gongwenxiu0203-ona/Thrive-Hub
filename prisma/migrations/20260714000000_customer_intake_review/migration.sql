CREATE TABLE "CustomerIntakeSubmission" (
 "id" TEXT NOT NULL PRIMARY KEY, "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "brandName" TEXT NOT NULL,
 "payload" TEXT NOT NULL, "baselinePayload" TEXT, "customerId" TEXT, "sharedByUserId" TEXT, "channelUserId" TEXT,
 "reviewedById" TEXT, "reviewedAt" DATETIME, "reviewNote" TEXT, "appliedFields" TEXT, "createdCustomerId" TEXT,
 "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "CustomerIntakeSubmission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "CustomerIntakeSubmission_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "CustomerIntakeSubmission_channelUserId_fkey" FOREIGN KEY ("channelUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "CustomerIntakeSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "CustomerIntakeSubmission_createdCustomerId_fkey" FOREIGN KEY ("createdCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "CustomerIntakeSubmission_status_submittedAt_idx" ON "CustomerIntakeSubmission"("status", "submittedAt");
CREATE INDEX "CustomerIntakeSubmission_type_idx" ON "CustomerIntakeSubmission"("type");
CREATE INDEX "CustomerIntakeSubmission_customerId_status_idx" ON "CustomerIntakeSubmission"("customerId", "status");
CREATE INDEX "CustomerIntakeSubmission_brandName_idx" ON "CustomerIntakeSubmission"("brandName");
CREATE INDEX "CustomerIntakeSubmission_sharedByUserId_idx" ON "CustomerIntakeSubmission"("sharedByUserId");
CREATE INDEX "CustomerIntakeSubmission_channelUserId_idx" ON "CustomerIntakeSubmission"("channelUserId");
