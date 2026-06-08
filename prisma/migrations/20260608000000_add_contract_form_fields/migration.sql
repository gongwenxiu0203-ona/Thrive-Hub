-- 合同表单填写字段（v4 甲方项目确认书）
-- 甲方补充信息
ALTER TABLE "Contract" ADD COLUMN "partyACreditCode" TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyALegalRep" TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyAAddress" TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyAContact" TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyAPhone" TEXT;
ALTER TABLE "Contract" ADD COLUMN "partyAEmail" TEXT;

-- 合同费用补充
ALTER TABLE "Contract" ADD COLUMN "taxType" TEXT NOT NULL DEFAULT '不含税';
ALTER TABLE "Contract" ADD COLUMN "taxBearer" TEXT NOT NULL DEFAULT '甲方';
ALTER TABLE "Contract" ADD COLUMN "firstPeriodFee" REAL;
ALTER TABLE "Contract" ADD COLUMN "productList" TEXT;
ALTER TABLE "Contract" ADD COLUMN "coopChannels" TEXT;

-- 填写方式与外部链接
ALTER TABLE "Contract" ADD COLUMN "fillMethod" TEXT;
ALTER TABLE "Contract" ADD COLUMN "externalFillToken" TEXT;
ALTER TABLE "Contract" ADD COLUMN "externalFillExpiry" DATETIME;

-- 生成的合同文档
ALTER TABLE "Contract" ADD COLUMN "generatedDocUrl" TEXT;

-- 唯一索引（externalFillToken）
CREATE UNIQUE INDEX "Contract_externalFillToken_key" ON "Contract"("externalFillToken");
