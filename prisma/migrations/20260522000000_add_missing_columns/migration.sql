-- Migration: add_missing_columns
-- Adds columns that were pushed directly via `prisma db push` without a migration file.
-- NOTE: contractId/returnReason/meetingTime/meetingMode/meetingLocation/attendees were already
--       added in 20260514100312_v2_customer_contract_rework.
--       personInChargeName was added in 20260520000000_affiliate_pic_name.
--       batchId was added in 20260519000001_affiliate_batch.
--       Only the truly new columns remain below.

-- Customer: 评估数据、渠道商关联、创建者关联
ALTER TABLE "Customer" ADD COLUMN "evaluationData"  TEXT;
ALTER TABLE "Customer" ADD COLUMN "channelUserId"   TEXT;
ALTER TABLE "Customer" ADD COLUMN "createdById"     TEXT;

-- Affiliate: 品牌字段
ALTER TABLE "Affiliate" ADD COLUMN "brand"    TEXT;

-- Contract: 审核意见、锁定字段
ALTER TABLE "Contract" ADD COLUMN "reviewComment"  TEXT;
ALTER TABLE "Contract" ADD COLUMN "lockedFields"   TEXT NOT NULL DEFAULT '[]';

-- Task: 外部链接（其余字段已在 v2_customer_contract_rework 中添加）
ALTER TABLE "Task" ADD COLUMN "externalLinks"    TEXT NOT NULL DEFAULT '[]';
