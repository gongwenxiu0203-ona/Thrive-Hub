// Call Anthropic API to extract structured contract fields from raw text.
// Used by the "upload existing contract" flow. Returns a partial field map
// + a list of required fields that came back empty / missing.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-3-5-haiku-20241022";

/** Fields the upload flow attempts to populate. The "required" subset is
 *  what we surface to the user as missing if AI didn't find a value. */
export const UPLOAD_EXTRACT_REQUIRED: { key: string; label: string }[] = [
  { key: "partyAName", label: "甲方公司名称" },
  { key: "partyACreditCode", label: "甲方统一社会信用代码" },
  { key: "partyAAddress", label: "甲方地址" },
  { key: "partyAContact", label: "甲方指定联系人" },
  { key: "partyAPhone", label: "甲方电话" },
  { key: "partyAEmail", label: "甲方邮箱" },
  { key: "startDate", label: "合作开始日期" },
  { key: "endDate", label: "合作结束日期" },
  { key: "feeAmount", label: "月度服务费金额" },
  { key: "feeCurrency", label: "费用货币" },
  { key: "commissionRate", label: "GMV 佣金比例" },
];

export type ExtractedFields = Record<string, string | string[] | null>;

const PROMPT_HEADER = `你是合同信息抽取助手。请从合同正文中抽取以下字段并以 JSON 返回（找不到的字段填 null）：

{
  "partyAName": "甲方公司全称",
  "partyACreditCode": "甲方统一社会信用代码",
  "partyAAddress": "甲方注册地址",
  "partyAContact": "甲方指定联系人姓名",
  "partyAPhone": "甲方联系电话",
  "partyAEmail": "甲方电子邮箱",
  "startDate": "合作开始日期 YYYY-MM-DD",
  "endDate": "合作结束日期 YYYY-MM-DD",
  "feeAmount": "月度服务费金额（纯数字字符串）",
  "feeCurrency": "费用货币：人民币 或 美金",
  "commissionRate": "GMV 佣金比例（含 % 符号）",
  "feeCycle": "服务费支付周期：月 或 季度",
  "promoPlatform": "推广平台",
  "targetSite": "目标站点",
  "coopChannels": ["合作渠道key数组，可选 ACC/Attribution/Associates/AmazonLive/Levanta/Impact/Wayward/ArcherAffiliates/PartnerBoost"]
}

只输出 JSON，不要解释文字。合同文本：

`;

export async function aiExtractContractFields(text: string): Promise<{
  ok: true;
  fields: ExtractedFields;
  missing: { key: string; label: string }[];
} | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "未配置 ANTHROPIC_API_KEY，无法 AI 抽字段" };

  const prompt = PROMPT_HEADER + text.slice(0, 12000);
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
        max_tokens: 1500,
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
    const missing = UPLOAD_EXTRACT_REQUIRED.filter((f) => {
      const v = parsed[f.key];
      if (v == null) return true;
      if (typeof v === "string" && !v.trim()) return true;
      if (Array.isArray(v) && v.length === 0) return true;
      return false;
    });
    return { ok: true, fields: parsed, missing };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI 抽字段失败" };
  }
}
