-- 项目负责人字段（独立迁移，纯增量）
ALTER TABLE "Project" ADD COLUMN "ownerId" TEXT;
