-- Add a nullable idempotency key for automatically generated receivable tasks.
-- Existing manually-created tasks remain unchanged because the new column is nullable.
ALTER TABLE "Task" ADD COLUMN "automationKey" TEXT;

CREATE UNIQUE INDEX "Task_automationKey_key" ON "Task"("automationKey");
