// Call Anthropic API to extract structured contract fields from raw text.
// If ANTHROPIC_API_KEY is not configured, the upload flow still creates a
// draft-like contract and asks the user to supplement the required fields.

import { extractContractFieldsByRules, mergeRuleAndAiFields } from "@/lib/contractUploadRules";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-3-5-haiku-20241022";

// 上传「签署完成存档」必填校验集（甲方公司名称 + 销售/推广 + 合作期限 + 费用
// + 佣金）。未识别到的这些字段必须手动补填后才能归档为「签署完成」；其余字段
// （甲方信用代码/地址/联系人等）未识别可忽略、选择性补足。
export const UPLOAD_EXTRACT_REQUIRED: { key: string; label: string }[] = [
  { key: "partyAName", label: "甲方公司名称" },
  { key: "promoPlatform", label: "销售平台 / 推广平台" },
  { key: "targetSite", label: "目标站点" },
  { key: "startDate", label: "合作开始日期" },
  { key: "endDate", label: "合作结束日期" },
  { key: "feeCurrency", label: "固定服务费货币" },
  { key: "feeAmount", label: "月度服务费金额" },
  { key: "feeCycle", label: "固费支付周期" },
  { key: "commissionType", label: "GMV佣金结算方式" },
  { key: "commissionRate", label: "GMV抽佣比例" },
  { key: "gmvSettlementCycle", label: "GMV结算周期" },
];

// 「上传审核盖章」模式：需识别创建合同时的全部字段（含甲方完整信息），缺失必须补填。
export const UPLOAD_REVIEW_REQUIRED: { key: string; label: string }[] = [
  { key: "partyAName", label: "甲方公司名称" },
  { key: "partyACreditCode", label: "甲方统一社会信用代码" },
  { key: "partyAAddress", label: "甲方地址" },
  { key: "partyAContact", label: "甲方指定联系人" },
  { key: "partyAPhone", label: "甲方电话" },
  { key: "partyAEmail", label: "甲方邮箱" },
  { key: "promoPlatform", label: "销售平台 / 推广平台" },
  { key: "targetSite", label: "目标站点" },
  { key: "startDate", label: "合作开始日期" },
  { key: "endDate", label: "合作结束日期" },
  { key: "feeCurrency", label: "固定服务费货币" },
  { key: "feeAmount", label: "月度服务费金额" },
  { key: "feeCycle", label: "固费支付周期" },
  { key: "commissionType", label: "GMV佣金结算方式" },
  { key: "commissionRate", label: "GMV抽佣比例" },
  { key: "gmvSettlementCycle", label: "GMV结算周期" },
];

const COMMISSION_REQUIRED_FIELDS: Record<string, { key: string; label: string }[]> = {
  FIXED: [
    { key: "commissionRate", label: "GMV抽佣比例" },
  ],
  THRESHOLD: [
    { key: "thresholdCurrency", label: "门槛佣金币种" },
    { key: "thresholdAmount", label: "GMV门槛金额" },
    { key: "thresholdReachedRate", label: "达标后抽佣比例" },
    { key: "thresholdUnreachedRate", label: "未达标抽佣比例" },
  ],
  TIERED: [
    { key: "tieredRules", label: "阶梯佣金规则" },
  ],
  SPECIAL: [
    { key: "specialCommissionTerms", label: "特殊佣金条款" },
  ],
  INCREMENTAL: [
    { key: "excessBaseMonths", label: "基准月数" },
    { key: "excessCommissionRate", label: "超额增长部分佣金比例" },
  ],
  EXCESS: [
    { key: "excessBaseMonths", label: "基准月数" },
    { key: "excessCommissionRate", label: "超额增长部分佣金比例" },
  ],
};

function uniqueFields(fields: { key: string; label: string }[]) {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.key)) return false;
    seen.add(field.key);
    return true;
  });
}

function toContractField(field: { key: string; label: string }) {
  return field.key === "partyAName" ? { ...field, key: "partyA" } : field;
}

/** 按上传用途和佣金模板选择必填校验集。 */
export function uploadRequiredFields(
  mode: string,
  commissionType = "FIXED",
): { key: string; label: string }[] {
  const base = mode === "SIGNED_ARCHIVE" ? UPLOAD_EXTRACT_REQUIRED : UPLOAD_REVIEW_REQUIRED;
  const normalized = String(commissionType || "FIXED").toUpperCase();
  return uniqueFields([
    ...base.filter((field) => field.key !== "commissionRate"),
    ...(COMMISSION_REQUIRED_FIELDS[normalized] ?? COMMISSION_REQUIRED_FIELDS.FIXED),
  ].map(toContractField));
}

export type ExtractedFields = Record<string, unknown>;

const PROMPT_HEADER = `你是合同信息抽取助手。请从合同正文中抽取创建合同表单需要的字段，并只返回 JSON。
找不到的字段填 null。合作信息和推广信息也要识别。

字段：
{
  "partyAName": "甲方公司全称",
  "partyACreditCode": "甲方统一社会信用代码/商业登记号",
  "partyAAddress": "甲方地址",
  "partyAContact": "甲方指定联系人",
  "partyAPhone": "甲方联系电话",
  "partyAEmail": "甲方电子邮箱",
  "startDate": "合作开始日期 YYYY-MM-DD",
  "endDate": "合作结束日期 YYYY-MM-DD",
  "feeAmount": "月度服务费金额，纯数字字符串",
  "feeCurrency": "费用货币：人民币/美金/USD/RMB/EUR/GBP",
  "feeCycle": "服务费支付周期：月度/季度",
  "commissionType": "佣金结算方式：FIXED/SPECIAL/TIERED/THRESHOLD/INCREMENTAL",
  "commissionRate": "固定佣金比例，含或不含百分号均可",
  "thresholdCurrency": "门槛佣金币种：USD/EUR/GBP/RMB",
  "thresholdAmount": "门槛 GMV 金额",
  "thresholdReachedRate": "达标后抽佣比例",
  "thresholdUnreachedRate": "未达标抽佣比例",
  "tieredRules": "阶梯佣金规则 JSON 字符串，含 currency 和 tiers",
  "excessBaseMonths": "增量佣金基准月数",
  "excessCommissionRate": "增量佣金超额增长部分比例",
  "specialCommissionTerms": "特殊佣金条款原文或摘要",
  "gmvSettlementCycle": "GMV佣金结算周期：月度/季度",
  "promoPlatform": "推广平台",
  "targetSite": "目标站点",
  "coopChannels": ["合作渠道key数组，可选 ACC/Attribution/Associates/AmazonLive/Levanta/Impact/Wayward/ArcherAffiliates/PartnerBoost"]
}

合同文本：

`;

function missingFields(parsed: ExtractedFields): { key: string; label: string }[] {
  return UPLOAD_EXTRACT_REQUIRED.filter((f) => {
    const v = parsed[f.key];
    if (v == null) return true;
    if (typeof v === "string" && !v.trim()) return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
}

export async function aiExtractContractFields(text: string): Promise<{
  ok: true;
  fields: ExtractedFields;
  missing: { key: string; label: string }[];
} | { ok: false; error: string }> {
  const rule = extractContractFieldsByRules(text);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const fields = mergeRuleAndAiFields(rule, {});
    return { ok: true, fields, missing: missingFields(fields) };
  }

  const prompt = PROMPT_HEADER + text.slice(0, 16000);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `AI 服务返回 ${res.status}，请稍后重试` };
    }
    const data = await res.json();
    const raw: string = data.content?.[0]?.text ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "AI 返回格式异常" };
    const parsed = JSON.parse(match[0]) as ExtractedFields;
    const fields = mergeRuleAndAiFields(rule, parsed);
    return { ok: true, fields, missing: missingFields(fields) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI 抽字段失败" };
  }
}
