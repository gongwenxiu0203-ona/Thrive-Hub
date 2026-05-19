// Contract field extraction — rule-based by default, Claude API when an
// ANTHROPIC_API_KEY is configured. Both produce the same ExtractedContract shape.

export type ExtractedContract = {
  partyA: string;
  accountingPeriod: string;
  feeCycle: string; // 无 | 月度 | 季度
  feeAmount: string; // with ¥
  commissionRate: string; // with %
  affiliateRule: string;
  paymentCycle: string;
  invoiceReq: string;
  lateLiability: string;
  startDate: string; // yyyy-mm-dd
  endDate: string;
};

export type ExtractResult = {
  data: ExtractedContract;
  method: "RULE" | "AI";
};

const EMPTY: ExtractedContract = {
  partyA: "",
  accountingPeriod: "",
  feeCycle: "无",
  feeAmount: "",
  commissionRate: "",
  affiliateRule: "0",
  paymentCycle: "",
  invoiceReq: "无",
  lateLiability: "",
  startDate: "",
  endDate: "",
};

// Split-based clause extraction. Treats every line starting with `第X条`
// (Chinese numeral) as a clause boundary; returns the body of the clause whose
// heading line contains `keyword`. Falls back to a single line if no clause
// boundary matches.
const CLAUSE_HEADING_RE =
  /^\s*(?:第[一二三四五六七八九十百\d]+条|[一二三四五六七八九十]+、)/;

function sectionBody(text: string, keyword: string): string {
  const lines = text.split(/\n/);
  let inSection = false;
  const body: string[] = [];
  for (const line of lines) {
    const isHeading = CLAUSE_HEADING_RE.test(line);
    if (inSection && isHeading) break;
    if (isHeading && line.includes(keyword)) {
      inSection = true;
      continue; // skip the heading line itself
    }
    if (inSection) body.push(line);
  }
  if (body.length > 0) return body.join("\n").trim();
  // Fallback: single line containing the keyword.
  const line = lines.find((l) => l.includes(keyword));
  return line ? line.trim() : "";
}

// Strict version: only returns content when a clause heading matches the
// keyword. No single-line fallback. Used for fields that must default to "无"
// if no dedicated clause exists (e.g. 发票要求).
function sectionBodyStrict(text: string, keyword: string): string {
  const lines = text.split(/\n/);
  let inSection = false;
  const body: string[] = [];
  for (const line of lines) {
    const isHeading = CLAUSE_HEADING_RE.test(line);
    if (inSection && isHeading) break;
    if (isHeading && line.includes(keyword)) {
      inSection = true;
      continue;
    }
    if (inSection) body.push(line);
  }
  return body.length > 0 ? body.join("\n").trim() : "";
}

function firstParagraph(body: string): string {
  const para = body.split(/\n\s*\n/)[0] ?? body;
  // Or first numbered sub-item.
  const sub = body.match(/^\s*[\d.]+[^\n]*(?:\n(?!\s*[\d.]+)[^\n]*)*/);
  return (sub ? sub[0] : para).trim();
}

/** Deterministic rule-based extraction following the documented contract layout. */
export function extractByRules(text: string): ExtractedContract {
  const out: ExtractedContract = { ...EMPTY };
  if (!text.trim()) return out;

  // 甲方合同主体 — 只取甲方公司名称
  const partyAMatch = text.match(/甲\s*方[（(]?\s*(?:以下简称[^）)]*[）)]?\s*)?[:：]\s*([^\n，,；;（(]+)/);
  out.partyA = partyAMatch ? partyAMatch[1].trim() : "";

  // 合作期限 → 起止日期
  const periodBody =
    sectionBody(text, "合作期限") ||
    (text.match(/合作期限[^\n]*/)?.[0] ?? "");
  const dates = periodBody.match(
    /(\d{4})[\s./年-]+(\d{1,2})[\s./月-]+(\d{1,2})/g,
  );
  if (dates && dates.length >= 1) {
    const norm = (d: string) => {
      const m = d.match(/(\d{4})[\s./年-]+(\d{1,2})[\s./月-]+(\d{1,2})/);
      if (!m) return "";
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    };
    out.startDate = norm(dates[0]);
    if (dates[1]) out.endDate = norm(dates[1]);
  }

  // 服务费 / 固定服务费
  const feeBody = sectionBody(text, "服务费");

  // 固费金额 — 取"/"前面的金额
  const feeAmtMatch = (feeBody || text).match(/固定服务费[:：]?\s*([¥￥]?\s*[\d,，.]+)\s*\//);
  if (feeAmtMatch) {
    let amt = feeAmtMatch[1].replace(/\s/g, "");
    if (!/^[¥￥]/.test(amt)) amt = `¥${amt}`;
    out.feeAmount = amt;
  }

  // 固费周期 — 取"固定服务费"中"/"后面的内容
  const feeLineMatch = (feeBody || text).match(/固定服务费[:：]?\s*[¥￥]?[\d,，.]+\s*\/\s*([^\n，,；;]+)/);
  if (feeLineMatch) {
    const cycleText = feeLineMatch[1].trim();
    if (cycleText.includes("月")) out.feeCycle = "月度";
    else if (cycleText.includes("季")) out.feeCycle = "季度";
    else if (cycleText.includes("年")) out.feeCycle = "年度";
    else out.feeCycle = cycleText || "无";
  }

  // 付款周期 — 支付方式后面的全部内容
  const payMatch = (feeBody || text).match(/支付方式[：:]\s*([\s\S]*?)(?=\n\n|\n[一二三四五六七八九十第]|$)/);
  if (payMatch) {
    out.paymentCycle = payMatch[1].trim();
  } else {
    const payBody = sectionBody(text, "支付方式");
    if (payBody) out.paymentCycle = payBody;
  }

  // 联盟佣金规则
  const ruleBody = sectionBody(text, "联盟佣金规则");
  if (ruleBody) {
    out.affiliateRule = ruleBody;
    // 抽佣比例 — 取最后一个百分比（GMV超门槛后的实际费率）
    const pcts = [...ruleBody.matchAll(/([\d.]+)\s*%/g)];
    if (pcts.length > 0) out.commissionRate = `${pcts[pcts.length - 1][1]}%`;
  }

  // 核算周期 — 提取4.1整个部分直到4.2
  const accSection =
    sectionBody(text, "对账与核算") ||
    sectionBody(text, "对账与结算") ||
    sectionBody(text, "对账");
  if (accSection) {
    const sub41 = accSection.match(/4\.1[^]*?(?=4\.2|$)/);
    out.accountingPeriod = sub41 ? sub41[0].trim() : firstParagraph(accSection);
  }

  // 发票要求 — only if a dedicated clause exists; otherwise "无".
  const invBody = sectionBodyStrict(text, "发票");
  out.invoiceReq = invBody || "无";

  // 逾期责任
  const lateBody = sectionBody(text, "逾期责任") || sectionBody(text, "逾期");
  if (lateBody) out.lateLiability = lateBody;

  return out;
}

const EXTRACT_PROMPT = `你是合同信息抽取助手。请从下面的「联盟营销服务合作协议」全文中，按规则抽取字段，输出严格的 JSON（不要任何额外文字）。

抽取规则：
- partyA：仅提取甲方（品牌方）公司名称，从合同开头"甲方：XXX"处提取，只要公司名称字符串，不要"甲方：XXX / 乙方：YYY"格式。
- accountingPeriod：从"对账与核算"或"对账与结算"条款中，完整提取4.1小节（月度核算）直到4.2为止的全部原文，不要总结。
- feeCycle：从"固定服务费"行中，取"/"后面的文字判断周期，"月"→"月度"，"季度"→"季度"，"年"→"年度"，无则填"无"。
- feeAmount：从"固定服务费"行中，取"/"前面的金额，带人民币符号 ¥，如"¥10,000"。
- commissionRate：从"联盟佣金规则"条款中，提取最后一个百分比（即GMV超过门槛后的实际费率），保留 % 符号，如"8%"。
- affiliateRule：完整原文提取"联盟佣金规则"条款的全部内容，不要总结；若无则填"0"。
- paymentCycle：从"服务费"条款中，提取"支付方式："后面的全部内容原文，不要总结。
- invoiceReq：发票要求的完整原文；合同中无发票相关内容则填"无"。
- lateLiability：完整原文提取"逾期责任"条款的全部内容，不要总结。
- startDate / endDate：合作期限的起止日期，格式 yyyy-mm-dd。

输出 JSON 结构：
{"partyA":"","accountingPeriod":"","feeCycle":"","feeAmount":"","commissionRate":"","affiliateRule":"","paymentCycle":"","invoiceReq":"","lateLiability":"","startDate":"","endDate":""}

合同全文：
`;

/** Claude API extraction. Falls back to rules on any error. */
export async function extractByAI(text: string): Promise<ExtractedContract> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("未配置 ANTHROPIC_API_KEY");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 2000,
      messages: [{ role: "user", content: EXTRACT_PROMPT + text }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API 调用失败 (${res.status})`);
  }
  const json = await res.json();
  const content: string = json?.content?.[0]?.text ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 返回结果无法解析");
  const parsed = JSON.parse(match[0]) as Partial<ExtractedContract>;
  return { ...EMPTY, ...parsed };
}

/** Extract using AI when available, otherwise rules. Never throws. */
export async function extractContract(text: string): Promise<ExtractResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return { data: await extractByAI(text), method: "AI" };
    } catch {
      // fall through to rule-based
    }
  }
  return { data: extractByRules(text), method: "RULE" };
}
