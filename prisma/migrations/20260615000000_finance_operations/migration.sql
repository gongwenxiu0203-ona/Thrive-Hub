-- Finance Operations module: add 3 new tables (additive only, no destructive ops)

-- Table 1: Client Revenue Monthly Snapshot
CREATE TABLE "ClientRevenueSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "month" TEXT NOT NULL,
    "projectStartDate" DATETIME,
    "clientStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "churnedAt" DATETIME,
    "monthlyFeeCurrency" TEXT NOT NULL DEFAULT 'USD',
    "monthlyFeeAmount" REAL NOT NULL DEFAULT 0,
    "exchangeRate" REAL NOT NULL DEFAULT 1,
    "monthlyFeeRmb" REAL NOT NULL DEFAULT 0,
    "commissionRate" REAL NOT NULL DEFAULT 0,
    "monthlyGmv" REAL NOT NULL DEFAULT 0,
    "monthlyCommissionIncome" REAL NOT NULL DEFAULT 0,
    "monthlyTotalIncome" REAL NOT NULL DEFAULT 0,
    "cumulativeIncome" REAL NOT NULL DEFAULT 0,
    "amOwnerId" TEXT,
    "bdOwnerId" TEXT,
    "revenueGrade" TEXT NOT NULL DEFAULT 'C',
    "signingCompany" TEXT,
    "receivingCompany" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientRevenueSnapshot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClientRevenueSnapshot_amOwnerId_fkey" FOREIGN KEY ("amOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClientRevenueSnapshot_bdOwnerId_fkey" FOREIGN KEY ("bdOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClientRevenueSnapshot_customerId_month_key" ON "ClientRevenueSnapshot"("customerId", "month");
CREATE INDEX "ClientRevenueSnapshot_month_idx" ON "ClientRevenueSnapshot"("month");
CREATE INDEX "ClientRevenueSnapshot_clientStatus_idx" ON "ClientRevenueSnapshot"("clientStatus");
CREATE INDEX "ClientRevenueSnapshot_revenueGrade_idx" ON "ClientRevenueSnapshot"("revenueGrade");

-- Table 2: Accounts Receivable
CREATE TABLE "AccountsReceivable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL,
    "invoiceAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" REAL NOT NULL DEFAULT 1,
    "amountRmb" REAL NOT NULL DEFAULT 0,
    "receivedAmount" REAL NOT NULL DEFAULT 0,
    "dueDate" DATETIME NOT NULL,
    "actualReceivedDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'NOT_DUE',
    "riskLevel" TEXT NOT NULL DEFAULT 'GREEN',
    "followOwnerId" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountsReceivable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountsReceivable_followOwnerId_fkey" FOREIGN KEY ("followOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountsReceivable_invoiceNo_key" ON "AccountsReceivable"("invoiceNo");
CREATE INDEX "AccountsReceivable_customerId_idx" ON "AccountsReceivable"("customerId");
CREATE INDEX "AccountsReceivable_status_idx" ON "AccountsReceivable"("status");
CREATE INDEX "AccountsReceivable_riskLevel_idx" ON "AccountsReceivable"("riskLevel");
CREATE INDEX "AccountsReceivable_dueDate_idx" ON "AccountsReceivable"("dueDate");

-- Table 3: Sales Pipeline
CREATE TABLE "SalesPipeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prospectName" TEXT NOT NULL,
    "source" TEXT,
    "countryRegion" TEXT,
    "category" TEXT,
    "estimatedMonthlyFee" REAL,
    "estimatedCommissionRate" REAL,
    "estimatedGmv" REAL,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "probability" REAL NOT NULL DEFAULT 10,
    "expectedSignDate" DATETIME,
    "bdOwnerId" TEXT,
    "nextAction" TEXT,
    "nextFollowUpAt" DATETIME,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesPipeline_bdOwnerId_fkey" FOREIGN KEY ("bdOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SalesPipeline_stage_idx" ON "SalesPipeline"("stage");
CREATE INDEX "SalesPipeline_bdOwnerId_idx" ON "SalesPipeline"("bdOwnerId");
CREATE INDEX "SalesPipeline_expectedSignDate_idx" ON "SalesPipeline"("expectedSignDate");
