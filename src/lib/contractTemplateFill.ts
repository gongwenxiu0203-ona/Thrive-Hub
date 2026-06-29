import fs from "fs";
import path from "path";
import JSZip from "jszip";

export type FieldsMap = Record<string, string | number | null | undefined>;

function escXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 转义并把换行 \n 渲染成 docx 软换行 <w:br/>，使多账户「一个字段一行」。 */
function escXmlMultiline(raw: string): string {
  return raw.split("\n").map(escXml).join('</w:t><w:br/><w:t xml:space="preserve">');
}

/** 去掉百分号（模板里 % 已写在空位之后，只需填数字）。 */
function pct(v: string): string {
  return v.replace(/[%％\s]/g, "").trim();
}

/** 解析 commissionConfig JSON（读取门槛/特殊/阶梯等嵌套值）。 */
interface CommissionConfigShape {
  threshold?: Record<string, string>;
  special?: Record<string, string>;
  tiered?: { currency?: string; tiers?: { from?: string; to?: string; rate?: string }[] };
}
function parseCommissionConfigSafe(raw: string): CommissionConfigShape {
  try {
    const o = JSON.parse(raw || "{}");
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/** 填入月度服务费金额：金额位是同时带「绿色高亮 + 单下划线」的空白 run
 *  （rPr 内两标签顺序不限），只填空白位、不动其它内容。 */
function fillAmount(xml: string, fields: FieldsMap): string {
  const amount = field(fields, "feeAmount");
  if (!amount) return xml;
  let filled = false;
  const next = xml.replace(/<w:r\b(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (run) => {
    if (filled) return run;
    if (!run.includes('<w:highlight w:val="green"/>')) return run;
    if (!run.includes('<w:u w:val="single"/>')) return run;
    // 仅填内容为空白的 <w:t>（避免误改已有文字的下划线绿字）
    if (!/<w:t[^>]*>\s*<\/w:t>/.test(run)) return run;
    filled = true;
    return run.replace(/(<w:t[^>]*>)\s*(<\/w:t>)/, `$1${escXml(amount)}$2`);
  });
  return next;
}

function fillServiceFeeAmount(xml: string, fields: FieldsMap): string {
  const amount = field(fields, "feeAmount");
  if (!amount) return xml;

  return replaceParagraphs(xml, (inner) => {
    const text = textMatches(inner).map((m) => m.text).join("");
    const compact = normalizeText(text);
    if (!compact.includes("每个月按照") || !compact.includes("元/月作为月度服务费")) {
      return inner;
    }

    let filled = false;
    return inner.replace(/<w:r\b(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (run) => {
      if (filled) return run;
      if (!run.includes('<w:u w:val="single"/>')) return run;
      if (!/<w:t[^>]*>\s*<\/w:t>/.test(run)) return run;
      filled = true;
      return run.replace(/(<w:t[^>]*>)\s*(<\/w:t>)/, `$1${escXml(amount)}$2`);
    });
  });
}

function display(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function field(fields: FieldsMap, key: string): string {
  return display(fields[key]).trim();
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, "");
}

function stripOutputBackgrounds(xml: string): string {
  return xml
    .replace(/<w:highlight\b[^>]*\/>/g, "")
    .replace(/<w:shd\b[^>]*\/>/g, "");
}

// ─── 复选框就地勾选 ───────────────────────────────────────────────────────────
// 模板里的复选框是 Wingdings 2 字体的空框符号 <w:sym w:font="Wingdings 2" .../>。
// 勾选 = 把被选中项前面的那个空框符号 run 原地替换成 Unicode ☑（不新增框、不删
// 未选项、不动正文文字）。正文叙述里出现的同名词（如「目标站点」「Amazon
// Attribution」）前面没有复选框符号，因此天然不受影响。

const CHANNEL_TOKENS: Record<string, string> = {
  ACC: "Amazon Creator Connections",
  Attribution: "Amazon Attribution",
  Associates: "Amazon Associates",
  AmazonLive: "Amazon Live",
  Levanta: "Levanta",
  Impact: "Impact",
  Wayward: "Wayward",
  ArcherAffiliates: "Archer Affiliates",
  PartnerBoost: "PartnerBoost",
  PrivateSocial: "私域",
};

const PLATFORM_TOKENS = ["亚马逊", "沃尔玛", "独立站"];
const SITE_TOKENS = ["美国站", "加拿大", "德国站", "英国站", "法国", "西班牙", "意大利", "澳洲", "日本"];

function splitList(raw: string): string[] {
  return raw.split(/[,，、;；]/).map((v) => v.trim()).filter(Boolean);
}

interface Selections {
  platforms: Set<string>;
  sites: Set<string>;
  channels: Set<string>; // 渠道标签（含空格的原文，如 "Amazon Attribution"）
  currency: "RMB" | "USD" | null;
  payCycle: "month" | "quarter" | null;
  gmvCycle: "month" | "quarter" | null;
}

function computeSelections(fields: FieldsMap): Selections {
  const promo = field(fields, "promoPlatform");
  const sitesF = field(fields, "targetSite");
  const chKeys = new Set(splitList(field(fields, "coopChannelKeys") || field(fields, "coopChannels")));
  const cur = field(fields, "feeCurrency");
  const fee = field(fields, "feeCycle");
  const gmv = field(fields, "gmvSettlementCycle");
  return {
    platforms: new Set(PLATFORM_TOKENS.filter((t) => promo.includes(t))),
    sites: new Set(SITE_TOKENS.filter((t) => sitesF.includes(t))),
    channels: new Set(
      Object.entries(CHANNEL_TOKENS).filter(([k]) => chKeys.has(k)).map(([, v]) => v),
    ),
    currency: cur ? (cur.includes("美") || /usd/i.test(cur) ? "USD" : "RMB") : null,
    payCycle: fee ? (fee.includes("季") ? "quarter" : "month") : null,
    gmvCycle: gmv ? (gmv.includes("季") ? "quarter" : "month") : null,
  };
}

/** 判断某个复选框（由其后标签 label + 所在段落上下文 para 决定）是否应勾选。
 *  label / para 均已去空格。固费周期与 GMV 结算周期两行的框标签都是「月 / 季度」，
 *  必须靠段落上下文（「服务费按」 vs 「联盟归因GMV佣金按」）区分。 */
function decideTick(label: string, para: string, sel: Selections): boolean {
  for (const t of PLATFORM_TOKENS) if (label.startsWith(t)) return sel.platforms.has(t);
  for (const t of SITE_TOKENS) if (label.startsWith(t)) return sel.sites.has(t);
  for (const t of sel.channels) if (label.startsWith(normalizeText(t))) return true;
  for (const t of Object.values(CHANNEL_TOKENS)) if (label.startsWith(normalizeText(t))) return false;
  if (label.startsWith("人民币")) return sel.currency === "RMB";
  if (label.startsWith("美金") || label.startsWith("美元")) return sel.currency === "USD";

  const isPay = para.includes("服务费按");
  const isGmv = para.includes("GMV佣金按") || para.includes("联盟归因GMV");
  if (label.startsWith("季度预付")) return isPay && sel.payCycle === "quarter";
  if (label.startsWith("季度")) {
    if (isPay) return sel.payCycle === "quarter";
    if (isGmv) return sel.gmvCycle === "quarter";
    return false;
  }
  if (label.startsWith("月")) {
    if (isPay) return sel.payCycle === "month";
    if (isGmv) return sel.gmvCycle === "month";
    return false;
  }
  return false;
}

// 匹配「包住一个 Wingdings 2 空框符号」的单个 run（不跨 run 边界）。
const BOX_RUN_RE = /<w:r(?:\s[^>]*)?>(?:(?!<\/?w:r\b)[\s\S])*?<w:sym w:font="Wingdings 2" w:char="(?:00A3|0052)"\/>(?:(?!<\/?w:r\b)[\s\S])*?<\/w:r>/g;
const BOX_SYM_RE = /<w:sym w:font="Wingdings 2" w:char="(?:00A3|0052)"\/>/;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function xmlText(s: string): string {
  return stripTags(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function withPct(v: string): string {
  const n = pct(v);
  if (!n) return "";
  return `${n}%`;
}

function cleanupPercentSpacing(xml: string): string {
  return xml.replace(/(\d)\s+([%％])/g, "$1$2");
}

function currencyLabel(v: string): string {
  const cur = v.trim();
  if (!cur) return "USD";
  if (/usd|美金|美元/i.test(cur)) return "USD";
  if (/eur|欧元/i.test(cur)) return "EUR";
  if (/gbp|英镑/i.test(cur)) return "GBP";
  if (/rmb|人民币|cny/i.test(cur)) return "RMB";
  return cur;
}

function nextAmount(prev: string | undefined): string {
  if (!prev) return "";
  const n = Number(String(prev).replace(/,/g, ""));
  if (!Number.isFinite(n)) return "";
  return String(n + 1);
}

/** 取 index 所在段落的可见文字（去空格），用于复选框上下文判定。 */
function paragraphTextAt(xml: string, index: number): string {
  let start = xml.lastIndexOf("<w:p>", index);
  const startAttr = xml.lastIndexOf("<w:p ", index);
  start = Math.max(start, startAttr);
  if (start < 0) start = 0;
  const end = xml.indexOf("</w:p>", index);
  return normalizeText(stripTags(xml.slice(start, end === -1 ? xml.length : end)));
}

function tickCheckboxes(xml: string, fields: FieldsMap): string {
  const sel = computeSelections(fields);

  // 模板里复选框有两种编码：① Wingdings 2 空框符号 run；② 文字字符 □。两种都收集。
  type Box = { start: number; end: number; checked: string };
  const boxes: Box[] = [];
  BOX_RUN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOX_RUN_RE.exec(xml)) !== null) {
    boxes.push({ start: m.index, end: m.index + m[0].length, checked: m[0].replace(BOX_SYM_RE, "<w:t>☑</w:t>") });
  }
  const LIT_RE = /□/g;
  let lm: RegExpExecArray | null;
  while ((lm = LIT_RE.exec(xml)) !== null) {
    boxes.push({ start: lm.index, end: lm.index + lm[0].length, checked: "☑" });
  }
  if (!boxes.length) return xml;
  boxes.sort((a, b) => a.start - b.start);

  const out: string[] = [];
  let cursor = 0;
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    // 该框的标签 = 本框之后、到下一个框（或本段落结束）之间的可见文字。
    const nextStart = i + 1 < boxes.length ? boxes[i + 1].start : xml.length;
    const paraEnd = xml.indexOf("</w:p>", box.end);
    const bound = Math.min(nextStart, paraEnd === -1 ? xml.length : paraEnd);
    const label = normalizeText(stripTags(xml.slice(box.end, bound)));
    const para = paragraphTextAt(xml, box.start);
    const tick = decideTick(label, para, sel);

    out.push(xml.slice(cursor, box.start));
    out.push(tick ? box.checked : xml.slice(box.start, box.end));
    cursor = box.end;
  }
  out.push(xml.slice(cursor));
  return out.join("");
}

// ─── 正文允许填写的字段（仅合同编号 / 甲乙方信息 / 合作起止时间）─────────────────
// 注意：平台 / 站点 / 渠道 / 货币 / 支付周期 / GMV 结算周期 / 佣金条款等一律不在
// 此处改写——平台·站点·渠道·货币·周期改为「复选框就地勾选」，佣金条款属于模板
// 自带固定正文，不可改动。

interface PlainState {
  creditCodeCount: number;
  emailCount: number;
}

function replacementForTemplateText(text: string, fields: FieldsMap, state: PlainState): string | null {
  const trimmed = text.trim();
  const compact = normalizeText(trimmed);
  if (!trimmed) return null;

  if (trimmed.startsWith("合同编号：")) return `合同编号：${field(fields, "contractNo")}`;
  if (trimmed.startsWith("甲方（客户）：")) return `甲方（客户）：${field(fields, "partyAName")}`;
  if (trimmed.startsWith("乙方（服务方）：")) return `乙方（服务方）：${field(fields, "partyBName")}`;
  if (trimmed.startsWith("统一社会信用代码/商业登记号：")) {
    state.creditCodeCount += 1;
    return `统一社会信用代码/商业登记号：${state.creditCodeCount % 2 === 1 ? field(fields, "partyACreditCode") : field(fields, "partyBCreditCode")}`;
  }
  if (compact.includes("本协议合作期限自") && compact.includes("日起至") && compact.includes("日止")) {
    return `本协议合作期限自 ${field(fields, "startYear")} 年 ${field(fields, "startMonth")} 月 ${field(fields, "startDay")} 日起至 ${field(fields, "endYear")} 年 ${field(fields, "endMonth")} 月 ${field(fields, "endDay")} 日止。`;
  }

  const partyBBanks = field(fields, "partyBBanks");
  const hasMultiBanks = partyBBanks.includes("\n");
  if (trimmed.startsWith("账户名称：")) return hasMultiBanks ? partyBBanks : `账户名称：${field(fields, "partyBBankAccountName")}`;
  if (hasMultiBanks && (trimmed.startsWith("开户银行：") || trimmed.startsWith("银行账号：") || trimmed.startsWith("SWIFT CODE"))) return "";
  if (trimmed.startsWith("开户银行：")) return `开户银行：${field(fields, "partyBBankName")}`;
  if (trimmed.startsWith("银行账号：")) return `银行账号：${field(fields, "partyBBankAccountNo")}`;
  if (trimmed.startsWith("SWIFT CODE")) return `SWIFT CODE（如适用）：${field(fields, "partyBBankSwift")}`;

  if (trimmed.startsWith("甲方地址：")) return `甲方地址：${field(fields, "partyAAddress")}`;
  if (trimmed.startsWith("乙方地址：")) return `乙方地址：${field(fields, "partyBAddress")}`;
  if (trimmed.startsWith("甲方指定联系人：")) return `甲方指定联系人：${field(fields, "partyAContact")}      电话：${field(fields, "partyAPhone")}`;
  if (trimmed.startsWith("乙方指定联系人：")) return `乙方指定联系人：${field(fields, "partyBContact")}      电话：${field(fields, "partyBPhone")}`;
  if (trimmed.startsWith("电子邮箱：")) {
    state.emailCount += 1;
    return `电子邮箱：${state.emailCount % 2 === 1 ? field(fields, "partyAEmail") : field(fields, "partyBEmail")}`;
  }

  // 项目确认书：4.1.1 月度服务费金额由 fillServiceFeeAmount 处理，避免整段重写破坏复选框位置。
  if (compact.includes("每个月按照") && compact.includes("元/月作为月度服务费")) {
    return null;
  }

  // 项目确认书：4.3 GMV 结算周期由 tickCheckboxes 原地勾选，不能整段重写。
  if (compact.includes("联盟归因GMV佣金按") && compact.includes("季度结算")) {
    return null;
  }

  // ── 项目确认书：佣金费率空位填写 ──────────────────────────────────────────────
  // 仅把段落里的 _____ 空位替换为费率/门槛/月数，其余措辞保持模板原文不变。
  // 各模板对应不同佣金机制，空位顺序见模板。
  if (compact.includes("固定点数联盟归因GMV")) {
    const rate = pct(field(fields, "commissionRate"));
    return rate ? text.replace(/_+/, rate) : null;
  }
  if (compact.includes("个月平均联盟GMV作为基准值")) {
    const vals = [field(fields, "excessBaseMonths"), pct(field(fields, "excessCommissionRate"))];
    let i = 0;
    return text.replace(/_+/g, () => vals[i++] || "_____");
  }
  if (compact.includes("未达到上述联盟归因GMV门槛")) {
    const cfg = parseCommissionConfigSafe(field(fields, "commissionConfig"));
    const thr = (cfg.threshold ?? {}) as { currency?: string; amount?: string; reachedRate?: string; unreachedRate?: string };
    const amount = [currencyLabel(thr.currency || field(fields, "thresholdCurrency")), thr.amount || field(fields, "thresholdAmount")].filter(Boolean).join(" ");
    const vals = [amount, pct(thr.reachedRate || field(fields, "commissionRate")), pct(thr.unreachedRate || "")];
    let i = 0;
    return text.replace(/_+/g, () => vals[i++] || "_____");
  }

  // ── SPECIAL（特殊佣金机制）各空位 ──
  const sp = parseCommissionConfigSafe(field(fields, "commissionConfig")).special ?? {};
  if (compact.includes("该渠道有效归因GMV的") && compact.includes("向乙方支付服务佣金")) {
    const r = pct(sp.attributionRate || field(fields, "commissionRate"));
    return r ? text.replace(/_+/, r) : null;
  }
  if (compact.includes("单个Campaign项下当月有效归因GMV低于")) {
    const cur = sp.lowGmvThresholdCurrency || "USD";
    let t = text.replace(/USD/, cur);
    if (sp.lowGmvThreshold) t = t.replace(/_+/, sp.lowGmvThreshold);
    return t;
  }
  if (compact.includes("作为渠道推广预算")) {
    const r = pct(sp.lowGmvBudgetRate || "");
    return r ? text.replace(/_+/, r) : null;
  }
  if (compact.includes("单个Campaign项下当月有效归因GMV达到或超过")) {
    const cur = sp.highGmvThresholdCurrency || sp.lowGmvThresholdCurrency || "USD";
    let t = text.replace(/USD/, cur);
    if (sp.highGmvThreshold) t = t.replace(/_+/, sp.highGmvThreshold);
    return t;
  }
  if (compact.includes("该Publisher对应有效归因GMV的") && compact.includes("向乙方支付服务佣金")) {
    const r = pct(sp.highGmvServiceRate || "");
    return r ? text.replace(/_+/, r) : null;
  }

  // ── TIERED：阶梯币种（区间与比例为表格，单独由 fillTieredTable 处理）──
  if (compact.includes("联盟归因GMV区间") && compact.includes("币种")) {
    const cur = parseCommissionConfigSafe(field(fields, "commissionConfig")).tiered?.currency
      || field(fields, "thresholdCurrency") || "USD";
    return text.replace(/(币种：)\s*(）|\))/, `$1${cur}$2`);
  }

  return null;
}

function textMatches(inner: string): { start: number; end: number; text: string }[] {
  const TEXT_RE = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  const matches: { start: number; end: number; text: string }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = TEXT_RE.exec(inner)) !== null) {
    matches.push({ start: mm.index, end: mm.index + mm[0].length, text: mm[2] });
  }
  return matches;
}

function rewriteParagraphText(inner: string, replacement: string): string {
  const matches = textMatches(inner);
  if (!matches.length) return inner;
  const firstMatch = matches[0];
  const result: string[] = [];
  result.push(inner.slice(0, firstMatch.start));
  const openTagMatch = inner.slice(firstMatch.start, firstMatch.end).match(/^<w:t(\s[^>]*)?>/);
  const openTag = openTagMatch ? openTagMatch[0] : "<w:t>";
  const preservedOpen = openTag.includes("xml:space=")
    ? openTag
    : openTag.replace(/^<w:t/, `<w:t xml:space="preserve"`);
  result.push(`${preservedOpen}${escXmlMultiline(replacement)}</w:t>`);
  let lastEnd = firstMatch.end;
  for (let i = 1; i < matches.length; i++) {
    const ti = matches[i];
    result.push(inner.slice(lastEnd, ti.start));
    const om = inner.slice(ti.start, ti.end).match(/^<w:t(\s[^>]*)?>/);
    const oTag = om ? om[0] : "<w:t>";
    result.push(`${oTag}</w:t>`);
    lastEnd = ti.end;
  }
  result.push(inner.slice(lastEnd));
  return result.join("");
}

function rewriteParagraphInner(inner: string, fields: FieldsMap): string {
  const matches = textMatches(inner);
  if (!matches.length) return inner;
  const concatenated = matches.map((m) => m.text).join("");
  if (!/\{\{[\w.]+\}\}/.test(concatenated)) return inner;
  const replaced = concatenated.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => {
    return key in fields ? display(fields[key]) : "";
  });
  return rewriteParagraphText(inner, replaced);
}

function rewriteKnownTemplateParagraphInner(inner: string, fields: FieldsMap, state: PlainState): string {
  const matches = textMatches(inner);
  if (!matches.length) return inner;
  const concatenated = matches.map((m) => m.text).join("");
  const replacement = replacementForTemplateText(concatenated, fields, state);
  return replacement === null ? inner : rewriteParagraphText(inner, replacement);
}

function replaceParagraphs(xml: string, rewrite: (inner: string) => string): string {
  const PARA_OPEN = /<w:p(\s[^>]*)?>/g;
  const out: string[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = PARA_OPEN.exec(xml)) !== null) {
    if (m.index > cursor) out.push(xml.slice(cursor, m.index));
    const openTagEnd = m.index + m[0].length;
    const closeIdx = xml.indexOf("</w:p>", openTagEnd);
    if (closeIdx === -1) {
      out.push(xml.slice(m.index));
      cursor = xml.length;
      break;
    }
    const inner = xml.slice(openTagEnd, closeIdx);
    out.push(m[0], rewrite(inner), "</w:p>");
    cursor = closeIdx + "</w:p>".length;
    PARA_OPEN.lastIndex = cursor;
  }
  if (cursor < xml.length) out.push(xml.slice(cursor));
  return out.join("");
}

type TierRule = { from: string; to: string; rate: string };

function getTieredRules(fields: FieldsMap): { currency: string; tiers: TierRule[] } {
  const cfg = parseCommissionConfigSafe(field(fields, "commissionConfig"));
  let currency = currencyLabel(cfg.tiered?.currency || field(fields, "thresholdCurrency") || "USD");
  let tiers = (cfg.tiered?.tiers ?? []).map((t) => ({
    from: display(t.from).trim(),
    to: display(t.to).trim(),
    rate: display(t.rate).trim(),
  }));

  if (!tiers.length) {
    try {
      const legacy = JSON.parse(field(fields, "tieredRules") || "{}") as {
        currency?: string;
        tiers?: TierRule[];
      };
      currency = currencyLabel(legacy.currency || currency);
      tiers = (legacy.tiers ?? []).map((t) => ({
        from: display(t.from).trim(),
        to: display(t.to).trim(),
        rate: display(t.rate).trim(),
      }));
    } catch {
      // ignore legacy parse failure
    }
  }

  return { currency, tiers: tiers.filter((t) => t.to || t.from || t.rate) };
}

function cellMatches(row: string): { start: number; end: number; text: string }[] {
  const re = /<w:tc\b[\s\S]*?<\/w:tc>/g;
  const cells: { start: number; end: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(row)) !== null) {
    cells.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return cells;
}

function setFirstCellText(row: string, cellIndex: number, text: string): string {
  const cells = cellMatches(row);
  const cell = cells[cellIndex];
  if (!cell) return row;
  const replacedCell = cell.text.replace(/(<w:p(\s[^>]*)?>)([\s\S]*?)(<\/w:p>)/, (_all, open, _attr, inner, close) => {
    if (textMatches(inner).length) return `${open}${rewriteParagraphText(inner, text)}${close}`;
    const run = `<w:r><w:t xml:space="preserve">${escXmlMultiline(text)}</w:t></w:r>`;
    const withRun = /<w:pPr\b[\s\S]*?<\/w:pPr>/.test(inner)
      ? inner.replace(/(<w:pPr\b[\s\S]*?<\/w:pPr>)/, `$1${run}`)
      : `${run}${inner}`;
    return `${open}${withRun}${close}`;
  });
  return `${row.slice(0, cell.start)}${replacedCell}${row.slice(cell.end)}`;
}

function formatTierRange(tier: TierRule, index: number, tiers: TierRule[]): string {
  const from = tier.from || (index === 0 ? "0" : nextAmount(tiers[index - 1]?.to));
  const to = tier.to;
  if (to) return `${from || "0"}-【${to}】元`;
  return `【${from || "0"}】元及以上`;
}

function fillTieredTable(xml: string, fields: FieldsMap): string {
  const { currency, tiers } = getTieredRules(fields);
  if (!tiers.length) return xml;

  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (table) => {
    const tableText = normalizeText(xmlText(table));
    if (!tableText.includes("联盟归因GMV区间") || !tableText.includes("佣金比例")) return table;

    let nextTable = table.replace(/(币种：)\s*[^）)]*(）|\))/g, `$1${currency}$2`);
    const rows: { start: number; end: number; text: string }[] = [];
    const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(nextTable)) !== null) {
      rows.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
    if (rows.length < 2) return nextTable;

    const headerIndex = rows.findIndex((row) => normalizeText(xmlText(row.text)).includes("佣金比例"));
    const startIndex = headerIndex >= 0 ? headerIndex + 1 : 1;
    const fillRows = rows.slice(startIndex).filter((row) => cellMatches(row.text).length >= 2);
    if (!fillRows.length) return nextTable;

    const rebuiltRows = new Map<number, string>();
    const baseRows = fillRows;
    tiers.forEach((tier, index) => {
      const sourceRow = baseRows[Math.min(index, baseRows.length - 1)];
      let row = sourceRow.text;
      row = setFirstCellText(row, 0, formatTierRange(tier, index, tiers));
      row = setFirstCellText(row, 1, withPct(tier.rate));
      rebuiltRows.set(index, row);
    });

    const out: string[] = [];
    let cursor = 0;
    let tierCursor = 0;
    for (const row of rows) {
      out.push(nextTable.slice(cursor, row.start));
      const targetPos = fillRows.findIndex((r) => r.start === row.start);
      if (targetPos >= 0) {
        if (tierCursor < tiers.length) {
          out.push(rebuiltRows.get(tierCursor) ?? row.text);
          tierCursor += 1;
        }
        // Drop unused template tier rows when fewer tiers are configured.
      } else {
        out.push(row.text);
      }
      cursor = row.end;
    }
    while (tierCursor < tiers.length) {
      out.push(rebuiltRows.get(tierCursor) ?? "");
      tierCursor += 1;
    }
    out.push(nextTable.slice(cursor));
    return out.join("");
  });
}

export function replaceMustacheInDocxXml(xml: string, fields: FieldsMap): string {
  return replaceParagraphs(xml, (inner) => rewriteParagraphInner(inner, fields));
}

export function replaceKnownTemplateTextInDocxXml(xml: string, fields: FieldsMap): string {
  const state: PlainState = { creditCodeCount: 0, emailCount: 0 };
  return replaceParagraphs(xml, (inner) => rewriteKnownTemplateParagraphInner(inner, fields, state));
}

export async function fillContractTemplate(templateBuffer: Buffer, fields: FieldsMap): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("模板文件结构异常：找不到 word/document.xml");
  const xml = await docFile.async("string");
  let newXml = replaceMustacheInDocxXml(xml, fields);
  newXml = replaceKnownTemplateTextInDocxXml(newXml, fields);
  newXml = fillTieredTable(newXml, fields);
  newXml = tickCheckboxes(newXml, fields);
  newXml = fillServiceFeeAmount(newXml, fields);
  newXml = fillAmount(newXml, fields);
  newXml = cleanupPercentSpacing(newXml);
  newXml = stripOutputBackgrounds(newXml);
  zip.file("word/document.xml", newXml);

  const headerFooterPaths = Object.keys(zip.files).filter((p) =>
    /^word\/(header|footer)\d*\.xml$/i.test(p)
  );
  for (const p of headerFooterPaths) {
    const f = zip.file(p);
    if (!f) continue;
    const hfXml = await f.async("string");
    zip.file(p, stripOutputBackgrounds(replaceMustacheInDocxXml(hfXml, fields)));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

export async function fillContractTemplateFromPath(absPath: string, fields: FieldsMap): Promise<Buffer> {
  const buf = fs.readFileSync(absPath);
  return fillContractTemplate(buf, fields);
}

export function templateUrlToAbsPath(fileUrl: string): string {
  const rel = fileUrl.replace(/^\//, "");
  return path.join(process.cwd(), "public", rel);
}
