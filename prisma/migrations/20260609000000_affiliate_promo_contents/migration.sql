-- 联盟商往期推广内容字段（JSON 数组，默认空）
ALTER TABLE "Affiliate" ADD COLUMN "promoContents" TEXT NOT NULL DEFAULT '[]';
