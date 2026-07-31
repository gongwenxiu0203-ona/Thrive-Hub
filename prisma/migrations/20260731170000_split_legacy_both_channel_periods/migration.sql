-- Split historical BOTH rows into independent fixed-fee and commission rows.
-- Non-destructive: copies commission data first, then narrows the original row to fixed-fee.

INSERT INTO "ChannelReconciliationPeriod" (
  "id", "reconciliationId", "streamType", "periodIndex", "periodLabel",
  "fixedFeeAmount", "commissionAmount", "fixedFeePaidAt", "commissionPaidAt",
  "periodStart", "periodEnd", "fixedFeeReceived", "commissionReceived",
  "fixedFeeReceivedCurrency", "commissionReceivedCurrency",
  "fixedFeeShareRate", "commissionShareRate", "fixedFeeShareAmount", "commissionShareAmount",
  "fixedFeeSplitDate", "commissionSplitDate", "confirmedGmv", "auditLog",
  "channelReviewStatus", "channelPushedAt", "channelReviewedAt", "channelDisputeReason",
  "channelReviewVersion", "paymentProofUrl", "proofUrl", "notes", "createdAt", "updatedAt"
)
SELECT
  'commission-split-' || "id", "reconciliationId", 'COMMISSION', 1000000 + "periodIndex", "periodLabel",
  NULL, "commissionAmount", NULL, "commissionPaidAt",
  "periodStart", "periodEnd", NULL, "commissionReceived",
  NULL, "commissionReceivedCurrency",
  NULL, "commissionShareRate", NULL, "commissionShareAmount",
  NULL, "commissionSplitDate", "confirmedGmv", "auditLog",
  CASE WHEN "commissionAmount" IS NOT NULL OR "commissionReceived" IS NOT NULL OR "commissionShareAmount" IS NOT NULL OR "commissionPaidAt" IS NOT NULL OR "confirmedGmv" IS NOT NULL
       THEN "channelReviewStatus" ELSE 'DRAFT' END,
  CASE WHEN "commissionAmount" IS NOT NULL OR "commissionReceived" IS NOT NULL OR "commissionShareAmount" IS NOT NULL OR "commissionPaidAt" IS NOT NULL OR "confirmedGmv" IS NOT NULL
       THEN "channelPushedAt" ELSE NULL END,
  CASE WHEN "commissionAmount" IS NOT NULL OR "commissionReceived" IS NOT NULL OR "commissionShareAmount" IS NOT NULL OR "commissionPaidAt" IS NOT NULL OR "confirmedGmv" IS NOT NULL
       THEN "channelReviewedAt" ELSE NULL END,
  CASE WHEN "commissionAmount" IS NOT NULL OR "commissionReceived" IS NOT NULL OR "commissionShareAmount" IS NOT NULL OR "commissionPaidAt" IS NOT NULL OR "confirmedGmv" IS NOT NULL
       THEN "channelDisputeReason" ELSE NULL END,
  CASE WHEN "commissionAmount" IS NOT NULL OR "commissionReceived" IS NOT NULL OR "commissionShareAmount" IS NOT NULL OR "commissionPaidAt" IS NOT NULL OR "confirmedGmv" IS NOT NULL
       THEN "channelReviewVersion" ELSE 0 END,
  CASE WHEN "commissionPaidAt" IS NOT NULL THEN "paymentProofUrl" ELSE NULL END,
  "proofUrl", "notes", "createdAt", CURRENT_TIMESTAMP
FROM "ChannelReconciliationPeriod"
WHERE "streamType" = 'BOTH';

UPDATE "ChannelReconciliationPeriod"
SET
  "streamType" = 'FIXED_FEE',
  "commissionAmount" = NULL,
  "commissionPaidAt" = NULL,
  "commissionReceived" = NULL,
  "commissionReceivedCurrency" = NULL,
  "commissionShareRate" = NULL,
  "commissionShareAmount" = NULL,
  "commissionSplitDate" = NULL,
  "confirmedGmv" = NULL,
  "channelReviewStatus" = CASE WHEN "fixedFeeAmount" IS NOT NULL OR "fixedFeeReceived" IS NOT NULL OR "fixedFeeShareAmount" IS NOT NULL OR "fixedFeePaidAt" IS NOT NULL
       THEN "channelReviewStatus" ELSE 'DRAFT' END,
  "channelPushedAt" = CASE WHEN "fixedFeeAmount" IS NOT NULL OR "fixedFeeReceived" IS NOT NULL OR "fixedFeeShareAmount" IS NOT NULL OR "fixedFeePaidAt" IS NOT NULL
       THEN "channelPushedAt" ELSE NULL END,
  "channelReviewedAt" = CASE WHEN "fixedFeeAmount" IS NOT NULL OR "fixedFeeReceived" IS NOT NULL OR "fixedFeeShareAmount" IS NOT NULL OR "fixedFeePaidAt" IS NOT NULL
       THEN "channelReviewedAt" ELSE NULL END,
  "channelDisputeReason" = CASE WHEN "fixedFeeAmount" IS NOT NULL OR "fixedFeeReceived" IS NOT NULL OR "fixedFeeShareAmount" IS NOT NULL OR "fixedFeePaidAt" IS NOT NULL
       THEN "channelDisputeReason" ELSE NULL END,
  "channelReviewVersion" = CASE WHEN "fixedFeeAmount" IS NOT NULL OR "fixedFeeReceived" IS NOT NULL OR "fixedFeeShareAmount" IS NOT NULL OR "fixedFeePaidAt" IS NOT NULL
       THEN "channelReviewVersion" ELSE 0 END,
  "paymentProofUrl" = CASE WHEN "fixedFeePaidAt" IS NOT NULL THEN "paymentProofUrl" ELSE NULL END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "streamType" = 'BOTH';