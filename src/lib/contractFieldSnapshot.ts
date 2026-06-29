// Field snapshot used for round-to-round diff in contract reviews.
// We don't add a schema column; instead a single ContractReviewComment row
// with fieldKey === SNAPSHOT_FIELD_KEY carries the JSON snapshot of the
// contract at the moment a review round opened.

import { prisma } from "@/lib/prisma";

export const SNAPSHOT_FIELD_KEY = "__SNAPSHOT__";

/** Keys included in the round-to-round diff. Display labels are kept in sync
 *  with PLACEHOLDER_KEYS where possible. */
export const SNAPSHOT_FIELDS: { key: string; label: string }[] = [
  { key: "partyAName", label: "甲方公司名称" },
  { key: "partyACreditCode", label: "甲方统一社会信用代码" },
  { key: "partyAAddress", label: "甲方地址" },
  { key: "partyAContact", label: "甲方指定联系人" },
  { key: "partyAPhone", label: "甲方电话" },
  { key: "partyAEmail", label: "甲方邮箱" },
  { key: "partyBCompany", label: "乙方公司" },
  { key: "partyBBankAccounts", label: "乙方收款账户" },
  { key: "startDate", label: "合作开始日期" },
  { key: "endDate", label: "合作结束日期" },
  { key: "feeAmount", label: "月度服务费金额" },
  { key: "feeCurrency", label: "费用货币" },
  { key: "feeCycle", label: "费用周期" },
  { key: "commissionRate", label: "GMV 佣金比例" },
  { key: "commissionType", label: "佣金类型" },
  { key: "gmvSettlementCycle", label: "GMV 结算周期" },
  { key: "thresholdAmount", label: "门槛金额" },
  { key: "thresholdCurrency", label: "门槛货币" },
  { key: "tieredRules", label: "阶梯规则" },
  { key: "excessBaseMonths", label: "增量基准月数" },
  { key: "excessCommissionRate", label: "增量佣金比例" },
  { key: "specialCommissionTerms", label: "特殊佣金条款" },
  { key: "promoPlatform", label: "推广平台" },
  { key: "targetSite", label: "目标站点" },
  { key: "coopChannels", label: "合作渠道" },
];

const BASE_REVIEW_FIELD_KEYS = new Set([
  "partyAName",
  "partyACreditCode",
  "partyAAddress",
  "partyAContact",
  "partyAPhone",
  "partyAEmail",
  "partyBCompany",
  "partyBBankAccounts",
  "startDate",
  "endDate",
  "feeAmount",
  "feeCurrency",
  "feeCycle",
  "commissionType",
  "gmvSettlementCycle",
  "promoPlatform",
  "targetSite",
  "coopChannels",
]);

const COMMISSION_REVIEW_FIELD_KEYS: Record<string, string[]> = {
  FIXED: ["commissionRate"],
  THRESHOLD: ["thresholdCurrency", "thresholdAmount", "commissionRate"],
  TIERED: ["tieredRules"],
  SPECIAL: ["specialCommissionTerms"],
  INCREMENTAL: ["excessBaseMonths", "excessCommissionRate"],
  EXCESS: ["excessBaseMonths", "excessCommissionRate"],
};

export function getReviewDecisionFields(templateKey?: string | null): { key: string; label: string }[] {
  const normalized = String(templateKey || "FIXED").toUpperCase();
  const keys = new Set([
    ...BASE_REVIEW_FIELD_KEYS,
    ...(COMMISSION_REVIEW_FIELD_KEYS[normalized] ?? COMMISSION_REVIEW_FIELD_KEYS.FIXED),
  ]);
  return SNAPSHOT_FIELDS.filter((field) => keys.has(field.key));
}

export type FieldSnapshot = Record<string, string>;

function asString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/** Collect a flat string snapshot for diffing. Date-typed fields are
 *  normalized to YYYY-MM-DD so equality compares cleanly. */
export async function collectContractFieldSnapshot(contractId: string): Promise<FieldSnapshot> {
  const c = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!c) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = c as any;
  const snap: FieldSnapshot = {};
  for (const { key } of SNAPSHOT_FIELDS) {
    if (key === "partyAName") {
      snap[key] = asString(any.partyA);
    } else {
      snap[key] = asString(any[key]);
    }
  }
  return snap;
}

/** Diff a current snapshot against a previous one. Returns ONLY keys whose
 *  string values differ. */
export function diffSnapshots(
  prev: FieldSnapshot,
  current: FieldSnapshot,
): { key: string; label: string; from: string; to: string }[] {
  const out: { key: string; label: string; from: string; to: string }[] = [];
  for (const { key, label } of SNAPSHOT_FIELDS) {
    const a = prev[key] ?? "";
    const b = current[key] ?? "";
    if (a !== b) out.push({ key, label, from: a, to: b });
  }
  return out;
}
