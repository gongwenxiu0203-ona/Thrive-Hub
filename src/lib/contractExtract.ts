// Contract field extraction — rule-based by default, Claude API when an
// ANTHROPIC_API_KEY is configured. Both produce the same ExtractedContract shape.
// Tuned against 0527-Merach v3 平台联盟营销服务合同+项目确认书（亚马逊）.

export type ExtractedContract = {
  // 基本信息
  partyA: string;
  startDate: string;          // yyyy-mm-dd
  endDate: string;
  // 推广信息
  promoPlatform: string;      // 亚马逊（Amazon）| 独立站 | 沃尔玛（Walmart）
  targetSite: string;         // 多选，逗号分隔："美国站,英国站"
  // 月度服务费
  feeAmount: string;          // 不含货币符号
  feeCurrency: string;        // 人民币 | 美金
  paymentMethod: string;      // 月付 | 季度预付
  // 联盟归因 GMV 佣金
  commissionType: string;     // FIXED | THRESHOLD | TIERED | EXCESS
  commissionRate: string;     // 含 %
  thresholdAmount: string;    // THRESHOLD: GMV 门槛金额（仅数字）
  thresholdCurrency: string;  // 人民币 | 美金
  tieredRules: string;        // TIERED: JSON string {currency, tiers:[{from,to,rate}]}
  excessBaseMonths: string;   // EXCESS: 基准月数
  excessCommissionRate: string; // EXCESS: 增长服务佣金比例 (含 %)
  gmvSettlementCycle: string; // 月度 | 季度
};

export type ExtractResult = {
  data: ExtractedContract;
  method: "RULE" | "AI";
};

const EMPTY: ExtractedContract = {
  partyA: "",
  startDate: "",
  endDate: "",
  promoPlatform: "",
  targetSite: "",
  feeAmount: "",
  feeCurrency: "人民币",
  paymentMethod: "",
  commissionType: "FIXED",
  commissionRate: "",
  thresholdAmount: "",
  thresholdCurrency: "人民币",
  tieredRules: "",
  excessBaseMonths: "",
  excessCommissionRate: "",
  gmvSettlementCycle: "",
};

// ☑ √ ✓ ■ 都视为已勾选
const CHECK_RE = "[☑√✓■]";

/** Deterministic rule-based extraction for the v3 平台联盟营销服务合同+项目确认书 template. */
export function extractByRules(text: string): ExtractedContract {
  const out: ExtractedContract = { ...EMPTY };
  if (!text.trim()) return out;

  // ── 甲方（客户）──────────────────────────────────────────────────────────────
  // 合同格式：
  //   甲方（客户）：
  //
  //   Hong Kong Merach Technology Co., Limited
  // 因此先尝试同行匹配，找不到则取下一行非空内容
  let partyAMatch = text.match(
    /甲\s*方\s*[（(]\s*客户\s*[）)]\s*[:：]\s*([^\n\r]+)/,
  );
  if (partyAMatch) {
    const sameLine = partyAMatch[1].trim();
    if (sameLine && !/^[_\s]*$/.test(sameLine)) {
      out.partyA = sameLine;
    } else {
      // 取下一段非空文本（≤40 字符，且不是"统一社会信用代码"等关键词）
      const after = text.slice(partyAMatch.index! + partyAMatch[0].length);
      const lines = after.split(/\n/).map((l) => l.trim());
      for (const line of lines) {
        if (!line) continue;
        if (/统一社会信用代码|法定代表|乙方|甲方/.test(line)) break;
        out.partyA = line;
        break;
      }
    }
  }
  if (!out.partyA) {
    // fallback：匹配 "甲方：XXX"
    partyAMatch = text.match(/甲\s*方\s*[:：]\s*([^\n\r，,；;（(]{1,60})/);
    if (partyAMatch) out.partyA = partyAMatch[1].trim();
  }

  // ── 合作期限 → 起止日期 ─────────────────────────────────────────────────────
  // 例："合作期限自：_2026_年_6_月_1_日起至_2027_年_5_月_31_日止"
  const periodMatch = text.match(
    /合作期限\s*自?\s*[:：]?\s*_*\s*(\d{4})\s*_*\s*年\s*_*\s*(\d{1,2})\s*_*\s*月\s*_*\s*(\d{1,2})\s*_*\s*日\s*起?\s*至\s*_*\s*(\d{4})\s*_*\s*年\s*_*\s*(\d{1,2})\s*_*\s*月\s*_*\s*(\d{1,2})\s*_*\s*日/,
  );
  if (periodMatch) {
    out.startDate = `${periodMatch[1]}-${periodMatch[2].padStart(2, "0")}-${periodMatch[3].padStart(2, "0")}`;
    out.endDate = `${periodMatch[4]}-${periodMatch[5].padStart(2, "0")}-${periodMatch[6].padStart(2, "0")}`;
  }

  // ── 1.1 推广平台 ────────────────────────────────────────────────────────────
  // 例："1.1 推广平台：亚马逊（Amazon)"
  const platformMatch = text.match(
    /1\.\s*1\s*推广平台\s*[:：]\s*([^\n\r]+)/,
  );
  if (platformMatch) {
    const v = platformMatch[1].trim().replace(/[；;。].*$/, "");
    if (/亚马逊|Amazon/i.test(v)) out.promoPlatform = "亚马逊（Amazon）";
    else if (/独立站/.test(v)) out.promoPlatform = "独立站";
    else if (/沃尔玛|Walmart/i.test(v)) out.promoPlatform = "沃尔玛（Walmart）";
  }

  // ── 1.2 目标站点（多选）─────────────────────────────────────────────────────
  // 例："1.2目标站点：☑美国站；□德国站；□英国站；□法国；□西班牙；□加拿大；□澳洲；□日本"
  const siteSection = text.match(/1\.\s*2\s*目标站点[\s\S]{0,500}/);
  if (siteSection) {
    const body = siteSection[0];
    const sites: string[] = [];
    for (const site of [
      "美国站",
      "英国站",
      "德国站",
      "法国",
      "西班牙",
      "加拿大",
      "澳洲",
      "日本",
    ]) {
      const re = new RegExp(`${CHECK_RE}\\s*${site}`);
      if (re.test(body)) sites.push(site);
    }
    out.targetSite = sites.join(",");
  }

  // ── 4.1 月度服务费 ──────────────────────────────────────────────────────────
  // 例："甲方应向乙方支付：□人民币 / ☑美金 _3000_______ 元/月作为月度服务费"
  const feeBlock = text.match(/4\.\s*1\s*月度服务费[\s\S]{0,800}/);
  const feeText = feeBlock ? feeBlock[0] : text;

  // 货币：检测 ☑/□ 在 人民币 / 美金 前
  const cnyChecked = new RegExp(`${CHECK_RE}\\s*人\\s*民\\s*币`).test(feeText);
  const usdChecked = new RegExp(`${CHECK_RE}\\s*美\\s*金`).test(feeText);
  if (usdChecked) out.feeCurrency = "美金";
  else if (cnyChecked) out.feeCurrency = "人民币";
  // 兜底：检查金额是否带 $/¥
  else if (/\$\s*[\d,]/.test(feeText)) out.feeCurrency = "美金";

  // 金额：在「人民币 / 美金 _数字_」之后
  const feeAmtMatch = feeText.match(
    /(?:人民币|美金)\s*_*\s*([\d,，.]+)\s*_*\s*元\s*\/\s*月/,
  );
  if (feeAmtMatch) {
    out.feeAmount = feeAmtMatch[1].replace(/，/g, ",").replace(/\s/g, "");
  }

  // 付款方式：服务费按 ☑月 / □季度预付
  const monthChecked = new RegExp(
    `服务费按\\s*${CHECK_RE}\\s*月`,
  ).test(feeText) || new RegExp(`${CHECK_RE}\\s*月\\s*[/／]\\s*[□${CHECK_RE.slice(1, -1)}]\\s*季度`).test(feeText);
  const quarterChecked = new RegExp(
    `[□${CHECK_RE.slice(1, -1)}]\\s*月\\s*[/／]\\s*${CHECK_RE}\\s*季度`,
  ).test(feeText) || new RegExp(`${CHECK_RE}\\s*季度`).test(feeText);
  if (quarterChecked && !monthChecked) {
    out.paymentMethod = "季度预付";
  } else if (monthChecked) {
    out.paymentMethod = "月付";
  }

  // ── 4.2 联盟归因 GMV 佣金 ───────────────────────────────────────────────────
  // 提取整个 4.2 段直到 4.3
  const gmvBlock = text.match(/4\.\s*2\s*联盟归因GMV佣金[\s\S]*?(?=4\.\s*3|$)/);
  const gmvText = gmvBlock ? gmvBlock[0] : "";

  if (gmvText) {
    // 检测 4 种结算方式中哪个被勾选
    const typeFixed = new RegExp(
      `${CHECK_RE}\\s*固定点数联盟归因GMV佣金`,
    ).test(gmvText);
    const typeThreshold = new RegExp(
      `${CHECK_RE}\\s*联盟归因GMV门槛佣金机制`,
    ).test(gmvText);
    const typeTiered = new RegExp(
      `${CHECK_RE}\\s*阶梯式联盟归因GMV佣金机制`,
    ).test(gmvText);
    const typeExcess = new RegExp(
      `${CHECK_RE}\\s*超额联盟归因GMV佣金机制`,
    ).test(gmvText);

    if (typeExcess) {
      out.commissionType = "EXCESS";
      // 基准月数 & 增长服务佣金比例
      const baseMatch = gmvText.match(
        /最近\s*_*\s*(\d+)\s*_*\s*个月/,
      );
      if (baseMatch) out.excessBaseMonths = baseMatch[1];
      const excessRate = gmvText.match(
        /支付\s*_*\s*([\d.]+)\s*_*\s*%\s*作为增长服务佣金/,
      );
      if (excessRate) {
        out.excessCommissionRate = `${excessRate[1]}%`;
        out.commissionRate = `${excessRate[1]}%`;
      }
    } else if (typeTiered) {
      out.commissionType = "TIERED";
      // 阶梯表格解析：寻找 0-X / X-Y / Z 及以上 + 对应百分比
      const tiers: Array<{ from: string; to: string; rate: string }> = [];
      // 币种检测
      const currencyMatch = gmvText.match(/币种\s*[:：]?\s*(人民币|美金|RMB|USD)/);
      let tCurrency = "人民币";
      if (currencyMatch) {
        tCurrency = /美金|USD/i.test(currencyMatch[1]) ? "美金" : "人民币";
      } else if (/\$/.test(gmvText)) {
        tCurrency = "美金";
      }

      // 0-X 元
      const t1 = gmvText.match(/0\s*-\s*[【\[]\s*([\d,，.]*)\s*[】\]]\s*元/);
      const r1 = gmvText.match(
        /0\s*-\s*[【\[][\d,，.\s]*[】\]]\s*元[\s\S]{0,200}?([\d.]+)\s*%/,
      );
      if (t1 || r1) {
        tiers.push({
          from: "0",
          to: (t1?.[1] || "").replace(/，/g, ",").replace(/\s/g, ""),
          rate: r1 ? `${r1[1]}%` : "",
        });
      }
      // X-Y 元
      const t2 = gmvText.match(
        /[【\[]\s*([\d,，.]*)\s*[】\]]\s*-\s*[【\[]\s*([\d,，.]*)\s*[】\]]\s*元/,
      );
      const r2Match = gmvText.match(
        /[【\[][\d,，.\s]*[】\]]\s*-\s*[【\[][\d,，.\s]*[】\]]\s*元[\s\S]{0,200}?([\d.]+)\s*%/,
      );
      if (t2 || r2Match) {
        tiers.push({
          from: (t2?.[1] || "").replace(/，/g, ",").replace(/\s/g, ""),
          to: (t2?.[2] || "").replace(/，/g, ",").replace(/\s/g, ""),
          rate: r2Match ? `${r2Match[1]}%` : "",
        });
      }
      // Z 元及以上
      const t3 = gmvText.match(/[【\[]\s*([\d,，.]*)\s*[】\]]\s*元\s*及\s*以\s*上/);
      const r3Match = gmvText.match(
        /[【\[][\d,，.\s]*[】\]]\s*元\s*及\s*以\s*上[\s\S]{0,200}?([\d.]+)\s*%/,
      );
      if (t3 || r3Match) {
        tiers.push({
          from: (t3?.[1] || "").replace(/，/g, ",").replace(/\s/g, ""),
          to: "",
          rate: r3Match ? `${r3Match[1]}%` : "",
        });
      }

      if (tiers.length > 0) {
        out.tieredRules = JSON.stringify({ currency: tCurrency, tiers });
      }
    } else if (typeThreshold) {
      out.commissionType = "THRESHOLD";
      // 门槛金额："当联盟归因GMV达到 $50000 后"
      const thrMatch = gmvText.match(
        /联盟归因\s*GMV\s*达到\s*_*\s*([¥￥$]?\s*[\d,，.]+)\s*_*\s*(?:元|万)?/,
      );
      if (thrMatch) {
        const raw = thrMatch[1];
        out.thresholdCurrency = /\$/.test(raw) ? "美金" : "人民币";
        let amt = raw.replace(/[¥￥$\s]/g, "").replace(/，/g, ",");
        if (/万/.test(thrMatch[0])) {
          const n = Number(amt.replace(/,/g, ""));
          if (!isNaN(n)) amt = (n * 10000).toString();
        }
        out.thresholdAmount = amt;
      }
      // 抽佣比例："联盟归因GMV的 _3_ % 作为服务佣金"
      const rateMatch = gmvText.match(
        /联盟归因\s*GMV\s*的\s*_*\s*([\d.]+)\s*_*\s*%\s*作为服务佣金/,
      );
      if (rateMatch) out.commissionRate = `${rateMatch[1]}%`;
    } else if (typeFixed) {
      out.commissionType = "FIXED";
      // "甲方向乙方支付联盟归因GMV的 __1.5___ % 作为服务佣金"
      const rateMatch = gmvText.match(
        /联盟归因\s*GMV\s*的\s*_*\s*([\d.]+)\s*_*\s*%\s*作为服务佣金/,
      );
      if (rateMatch) out.commissionRate = `${rateMatch[1]}%`;
    } else {
      // 没有勾选任何选项 → 默认 FIXED，尝试通用百分比提取
      const allPct = [...gmvText.matchAll(/([\d.]+)\s*%/g)];
      if (allPct.length > 0) {
        out.commissionType = "FIXED";
        out.commissionRate = `${allPct[0][1]}%`;
      }
    }
  }

  // ── 4.3 联盟归因 GMV 结算周期 ───────────────────────────────────────────────
  // 例："联盟归因GMV佣金按☑月 / □季度结算"
  const cycleBlock = text.match(
    /4\.\s*3[\s\S]{0,200}?联盟归因GMV佣金按[\s\S]{0,100}结算/,
  );
  if (cycleBlock) {
    const body = cycleBlock[0];
    const m = new RegExp(`${CHECK_RE}\\s*月`).test(body);
    const q = new RegExp(`${CHECK_RE}\\s*季度`).test(body);
    if (q && !m) out.gmvSettlementCycle = "季度";
    else if (m) out.gmvSettlementCycle = "月度";
  }

  return out;
}

// ── AI prompt ─────────────────────────────────────────────────────────────────

const EXTRACT_PROMPT = `你是合同信息抽取助手。从下面的「平台联盟营销服务合同 v3 模板 + 项目确认书」中抽取字段，输出严格的 JSON（不要任何额外文字）。

抽取规则：

【基本信息】
- partyA：从合同开头"甲方（客户）："后面提取甲方公司名称（可能跨行，取下一段非空文本，跳过"统一社会信用代码"等行）。例："Hong Kong Merach Technology Co., Limited"。
- startDate / endDate：第二条"合作期限"中"合作期限自：_YYYY_年_M_月_D_日起至_YYYY_年_M_月_D_日止"的起止日期，格式 yyyy-mm-dd。

【推广信息】（项目确认书第一节）
- promoPlatform：从"1.1 推广平台：XXX"中提取，标准化为以下之一：
  - "亚马逊（Amazon）" — 出现 亚马逊 / Amazon
  - "独立站"
  - "沃尔玛（Walmart）"
- targetSite：从"1.2目标站点：☑美国站；□德国站；…"中提取所有被☑/√/✓/■勾选的站点，多选用逗号分隔，取值范围：美国站、英国站、德国站、法国、西班牙、加拿大、澳洲、日本。例："美国站,英国站"。

【月度服务费】（4.1）
- feeCurrency：从"□人民币 / ☑美金 _3000_______ 元/月"中检测☑勾选的货币，填"人民币"或"美金"。
- feeAmount：仅数字部分，去掉货币符号和单位，如"3000"。
- paymentMethod：从"服务费按 ☑月 / □季度预付"中检测勾选项，填"月付"或"季度预付"。

【联盟归因GMV佣金】（4.2）判断 commissionType（4 种之一，看哪个☑被勾选）：
1. "FIXED" — ☑ 固定点数联盟归因GMV佣金
   - 从"甲方向乙方支付联盟归因GMV的 __1.5___ % 作为服务佣金"提取 commissionRate（含%），如"1.5%"
2. "THRESHOLD" — ☑ 联盟归因GMV门槛佣金机制
   - 从"当联盟归因GMV达到 _$50000_ 后"提取 thresholdAmount（仅数字"50000"）, thresholdCurrency（"$"→"美金"，"¥/￥"→"人民币"）
   - 从"按照…向乙方支付联盟归因GMV的 _3_ %"提取 commissionRate（"3%"）
3. "TIERED" — ☑ 阶梯式联盟归因GMV佣金机制
   - 抽取 tieredRules：JSON字符串 {"currency":"人民币","tiers":[{"from":"0","to":"100000","rate":"5%"},{"from":"100000","to":"500000","rate":"8%"},{"from":"500000","to":"","rate":"12%"}]}
   - 币种从"币种："后或金额符号判断
4. "EXCESS" — ☑ 超额联盟归因GMV佣金机制
   - 从"以合作开始前最近 _3_ 个月平均联盟GMV作为基准值"提取 excessBaseMonths（"3"）
   - 从"超出基准值部分，甲方向乙方支付 _10_ % 作为增长服务佣金"提取 excessCommissionRate（"10%"），同时 commissionRate 也填"10%"

【联盟归因GMV结算周期】（4.3）
- gmvSettlementCycle：从"联盟归因GMV佣金按☑月 / □季度结算"中检测勾选项，填"月度"或"季度"。

输出 JSON 结构（缺失字段填空字符串 ""，commissionType 必须有值）：
{"partyA":"","startDate":"","endDate":"","promoPlatform":"","targetSite":"","feeAmount":"","feeCurrency":"人民币","paymentMethod":"","commissionType":"FIXED","commissionRate":"","thresholdAmount":"","thresholdCurrency":"人民币","tieredRules":"","excessBaseMonths":"","excessCommissionRate":"","gmvSettlementCycle":""}

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

  if (!res.ok) throw new Error(`Claude API 调用失败 (${res.status})`);
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
