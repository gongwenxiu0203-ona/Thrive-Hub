import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";

/** 从粘贴文本中用 AI 提取 v4 合同字段 */
export async function POST(req: Request) {
  const session = await getSession();
  if (session && !isStaff(session.role)) return NextResponse.json({ error: "无权解析合同" }, { status: 403 });
  if (session) {
    try { await requireFeaturePermission(session, "contracts.create_upload", "EDIT"); }
    catch (error) { if (error instanceof FeaturePermissionError) return NextResponse.json({ error: "无权解析合同" }, { status: 403 }); throw error; }
  }
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "请粘贴合同文本" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "未配置 AI 提取功能（ANTHROPIC_API_KEY 缺失）" }, { status: 503 });
  }

  const prompt = `你是一个合同信息提取助手。请从以下合同文本中提取甲方信息和合作信息，以 JSON 格式返回，格式如下：

{
  "partyAName": "甲方公司名称（必填）",
  "partyACreditCode": "统一社会信用代码或其他对应信息",
  "partyALegalRep": "法定代表人",
  "partyAAddress": "甲方地址",
  "partyAContact": "甲方指定联系人",
  "partyAPhone": "联系电话",
  "partyAEmail": "联系邮箱",
  "promoPlatform": "推广平台（亚马逊/独立站/沃尔玛）",
  "targetSite": "目标站点，逗号分隔，如：美国站,英国站",
  "startDate": "合作开始日期 yyyy-mm-dd",
  "endDate": "合作结束日期 yyyy-mm-dd",
  "taxType": "税费类型（含税或不含税）",
  "taxBearer": "税费承担方（通常是甲方）",
  "feeAmount": "月度服务费金额（纯数字）",
  "feeCurrency": "货币（人民币或美金）",
  "firstPeriodFee": "首期服务费金额（纯数字，可为null）",
  "feeCycle": "固费支付周期（月付或季度预付）",
  "commissionType": "GMV佣金类型（FIXED/THRESHOLD/TIERED/EXCESS）",
  "commissionRate": "抽佣比例（含%符号，如8%）",
  "gmvSettlementCycle": "GMV结算周期（月度或季度）",
  "coopChannels": ["已确认的合作渠道key数组，可选：ACC/Attribution/Associates/AmazonLive/Levanta/Impact/Wayward/ArcherAffiliates/PrivateSocial"]
}

提取规则：
- 只提取甲方信息，乙方信息忽略
- 找不到的字段填 null 或空字符串
- coopChannels 用数组格式
- 日期严格用 yyyy-mm-dd 格式
- 只输出 JSON，不要任何其他文字

合同文本：
${text.slice(0, 8000)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "AI 提取失败，请稍后重试" }, { status: 502 });
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "AI 返回格式异常" }, { status: 500 });

    const extracted = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, data: extracted });
  } catch (err) {
    console.error("[v4-extract]", err);
    return NextResponse.json({ error: "提取失败，请重试" }, { status: 500 });
  }
}
