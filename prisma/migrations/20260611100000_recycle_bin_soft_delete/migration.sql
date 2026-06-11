-- 回收站软删除字段（6个实体，纯增量）
ALTER TABLE "Customer" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Affiliate" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Task" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Reminder" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "SalesBatch" ADD COLUMN "deletedAt" DATETIME;
