-- 工作日志 BD 工作进度字段（独立迁移，纯增量）
ALTER TABLE "WorkLog" ADD COLUMN "bdProgress" TEXT;
