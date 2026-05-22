-- Migration: add_missing_columns
-- Adds columns that were pushed directly via `prisma db push` without a migration file.
-- Safe to run on any database; columns are nullable or have defaults.

-- Customer: 评估数据、渠道商关联、创建者关联
ALTER TABLE "Customer" ADD COLUMN "evaluationData"  TEXT;
ALTER TABLE "Customer" ADD COLUMN "channelUserId"   TEXT;
ALTER TABLE "Customer" ADD COLUMN "createdById"     TEXT;

-- Affiliate: 品牌字段、负责人姓名快照、批次关联
ALTER TABLE "Affiliate" ADD COLUMN "brand"               TEXT;
ALTER TABLE "Affiliate" ADD COLUMN "personInChargeName"  TEXT;
ALTER TABLE "Affiliate" ADD COLUMN "batchId"             TEXT;

-- Contract: 审核意见、锁定字段
ALTER TABLE "Contract" ADD COLUMN "reviewComment"  TEXT;
ALTER TABLE "Contract" ADD COLUMN "lockedFields"   TEXT NOT NULL DEFAULT '[]';

-- Task: 外部链接、会议信息、合同关联、退回理由
ALTER TABLE "Task" ADD COLUMN "externalLinks"    TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Task" ADD COLUMN "contractId"       TEXT;
ALTER TABLE "Task" ADD COLUMN "returnReason"     TEXT;
ALTER TABLE "Task" ADD COLUMN "meetingTime"      DATETIME;
ALTER TABLE "Task" ADD COLUMN "meetingMode"      TEXT;
ALTER TABLE "Task" ADD COLUMN "meetingLocation"  TEXT;
ALTER TABLE "Task" ADD COLUMN "attendees"        TEXT NOT NULL DEFAULT '[]';
