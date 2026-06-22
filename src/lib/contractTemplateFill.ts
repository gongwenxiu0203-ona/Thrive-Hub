// Contract template filling: takes a .docx template + a flat fields map,
// returns a new .docx buffer with placeholders replaced.
//
// Placeholder convention (preferred): {{key}} anywhere in the template body.
// Run-merging — Word often splits a single visible {{partyAName}} across
// multiple <w:r><w:t>...</w:t></w:r> runs (e.g. {{, partyAName, }}). To handle
// this, we merge adjacent <w:t> contents into a single per-paragraph string
// before applying the substitution, then rewrite the paragraph's runs.

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

/** Stringify any field value into the form we want in the document. */
function display(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  return String(v);
}

function field(fields: FieldsMap, key: string): string {
  return display(fields[key]).trim();
}

function firstNonEmpty(...values: string[]): string {
  return values.find((v) => v.trim())?.trim() ?? "";
}

function stripOutputBackgrounds(xml: string): string {
  return xml
    .replace(/<w:highlight\b[^>]*\/>/g, "")
    .replace(/<w:shd\b[^>]*\/>/g, "");
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, "");
}

function cycleText(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.includes("季")) return "季度";
  if (v.includes("月")) return "月";
  return v;
}

function productText(raw: string): string {
  if (!raw.trim()) return "详见双方确认清单";
  return raw;
}

function tieredRulesText(raw: string): string {
  if (!raw.trim()) return "以双方书面确认的阶梯规则为准。";
  try {
    const parsed = JSON.parse(raw);
    const currency = display(parsed?.currency).trim();
    const tiers = Array.isArray(parsed?.tiers) ? parsed.tiers : [];
    if (!tiers.length) return raw;
    return tiers
      .map((tier: Record<string, unknown>) => {
        const from = display(tier.from ?? tier.gmvMin ?? "").trim();
        const to = display(tier.to ?? tier.gmvMax ?? "").trim();
        const rate = display(tier.rate ?? "").trim();
        const range = to ? `${from}-${to}` : `${from}以上`;
        return `${currency}${range}：${rate}`;
      })
      .join("；");
  } catch {
    return raw;
  }
}

function selectedChannelKeys(fields: FieldsMap): Set<string> {
  const raw = field(fields, "coopChannelKeys") || field(fields, "coopChannels");
  return new Set(raw.split(/[,，、]/).map((v) => v.trim()).filter(Boolean));
}

function channelLine(fields: FieldsMap, key: string, label: string): string {
  return `${selectedChannelKeys(fields).has(key) ? "☑" : "□"} ${label}`;
}

function commissionLine(fields: FieldsMap): string {
  const templateKey = field(fields, "templateKey") || field(fields, "commissionType");
  const rate = field(fields, "commissionRate") || "_____%";
  const thresholdCurrency = field(fields, "thresholdCurrency");
  const thresholdAmount = field(fields, "thresholdAmount");
  if (templateKey === "THRESHOLD") {
    const threshold = firstNonEmpty([thresholdCurrency, thresholdAmount].filter(Boolean).join(" "), "约定对赌GMV");
    return `除月度服务费外，甲方应向乙方支付联盟归因GMV佣金；当联盟归因GMV达到 ${threshold} 后，甲方按照达成对赌后的总联盟归因GMV的 ${rate} 作为服务佣金。`;
  }
  if (templateKey === "TIERED") {
    return `除月度服务费外，甲方应向乙方支付联盟归因GMV佣金，佣金按照阶梯GMV乘以对应比例计算：${tieredRulesText(field(fields, "tieredRules"))}`;
  }
  if (templateKey === "INCREMENTAL") {
    const baseMonths = field(fields, "excessBaseMonths") || "____";
    const excessRate = field(fields, "excessCommissionRate") || rate;
    return `除月度服务费外，甲方应向乙方支付联盟归因GMV佣金，佣金按照总包/增量口径计算：以合作开始前最近 ${baseMonths} 个月的平均联盟归因GMV为基准，超出基准部分按 ${excessRate} 作为服务佣金；如采用总包比例，则按（总包比例-已花费佣金比例）×GMV计算。`;
  }
  if (templateKey === "SPECIAL") {
    return field(fields, "specialCommissionTerms") || `除月度服务费外，甲方应向乙方支付特殊佣金，具体规则为：${rate}。`;
  }
  return `除月度服务费外，甲方应向乙方支付联盟归因GMV佣金，甲方向乙方按照固定点数联盟归因GMV的 ${rate} 作为服务佣金。`;
}

interface PlainState {
  creditCodeCount: number;
  addressCount: number;
  contactPhoneCount: number;
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
    const value = state.creditCodeCount % 2 === 1
      ? field(fields, "partyACreditCode")
      : field(fields, "partyBCreditCode");
    return `统一社会信用代码/商业登记号：${value}`;
  }
  if (compact.includes("本协议合作期限自") && compact.includes("日起至") && compact.includes("日止")) {
    return `本协议合作期限自 ${field(fields, "startYear")} 年 ${field(fields, "startMonth")} 月 ${field(fields, "startDay")} 日起至 ${field(fields, "endYear")} 年 ${field(fields, "endMonth")} 月 ${field(fields, "endDay")} 日止。`;
  }
  if (trimmed.startsWith("账户名称：")) return `账户名称：${field(fields, "partyBBankAccountName")}`;
  if (trimmed.startsWith("开户银行：")) return `开户银行：${field(fields, "partyBBankName")}`;
  if (trimmed.startsWith("银行账号：")) return `银行账号：${field(fields, "partyBBankAccountNo")}`;
  if (trimmed.startsWith("SWIFT CODE")) return `SWIFT CODE（如适用）：${field(fields, "partyBBankSwift")}`;
  if (trimmed.startsWith("甲方地址：")) {
    state.addressCount += 1;
    return `甲方地址：${field(fields, "partyAAddress")}`;
  }
  if (trimmed.startsWith("乙方地址：")) {
    state.addressCount += 1;
    return `乙方地址：${field(fields, "partyBAddress")}`;
  }
  if (trimmed.startsWith("甲方指定联系人：")) {
    state.contactPhoneCount += 1;
    return `甲方指定联系人：${field(fields, "partyAContact")}      电话：${field(fields, "partyAPhone")}`;
  }
  if (trimmed.startsWith("乙方指定联系人：")) {
    state.contactPhoneCount += 1;
    return `乙方指定联系人：${field(fields, "partyBContact")}      电话：${field(fields, "partyBPhone")}`;
  }
  if (trimmed.startsWith("电子邮箱：")) {
    state.emailCount += 1;
    return `电子邮箱：${state.emailCount % 2 === 1 ? field(fields, "partyAEmail") : field(fields, "partyBEmail")}`;
  }
  if (trimmed.startsWith("推广平台：")) return `推广平台：${field(fields, "promoPlatform") || "亚马逊（Amazon）"}`;
  if (trimmed.startsWith("目标站点：")) return `目标站点：${field(fields, "targetSite")}`;
  if (trimmed.startsWith("推广商品清单：")) return `推广商品清单：${productText(field(fields, "productListText"))}`;
  if (compact.includes("甲方每个月按照") && compact.includes("作为月度服务费")) {
    return `甲方每个月按照${field(fields, "feeCurrency")} ${field(fields, "feeAmount")} 元/月作为月度服务费。`;
  }
  if (trimmed.startsWith("服务费按")) {
    return `服务费按 ${cycleText(field(fields, "feeCycle")) || "月"} 预付。`;
  }
  if (compact.includes("联盟归因GMV佣金按") && compact.includes("结算")) {
    return `联盟归因GMV佣金按${cycleText(field(fields, "gmvSettlementCycle")) || "月"}结算。`;
  }
  if (
    compact.includes("固定点数联盟归因GMV")
    || compact.includes("阶梯式区间")
    || compact.includes("达到_____")
    || compact.includes("基准")
    || compact.includes("特殊佣金")
  ) {
    return commissionLine(fields);
  }
  if (trimmed.includes("Amazon Creator Connections")) return channelLine(fields, "ACC", "Amazon Creator Connections（创作者计划）");
  if (trimmed.includes("Amazon Attribution")) return channelLine(fields, "Attribution", "Amazon Attribution（归因链接）");
  if (trimmed.includes("Amazon Associates")) return channelLine(fields, "Associates", "Amazon Associates（亚马逊官方Affiliate联盟）");
  if (trimmed.includes("Amazon Live")) return channelLine(fields, "AmazonLive", "Amazon Live");
  if (trimmed.includes("Levanta")) return channelLine(fields, "Levanta", "Levanta");
  if (trimmed.includes("Impact")) return channelLine(fields, "Impact", "Impact");
  if (trimmed.includes("Wayward")) return channelLine(fields, "Wayward", "Wayward");
  if (trimmed.includes("Archer Affiliates")) return channelLine(fields, "ArcherAffiliates", "Archer Affiliates");
  if (trimmed.includes("PartnerBoost")) return channelLine(fields, "PartnerBoost", "PartnerBoost");
  return null;
}

/**
 * Replace {{key}} placeholders inside a docx XML string.
 *
 * Strategy: walk the XML at the paragraph level. For each paragraph, collect
 * the concatenated text of its <w:t> runs. If that text contains a placeholder,
 * substitute it and rewrite the paragraph so all the original text-bearing runs
 * are replaced by a single new <w:r><w:t> carrying the substituted text. The
 * paragraph's <w:pPr> (formatting) is preserved.
 */
export function replaceMustacheInDocxXml(xml: string, fields: FieldsMap): string {
  // Cheap pre-scan to short-circuit when no placeholder is anywhere in the file
  if (!/\{\{[\w.]+\}\}/.test(xml.replace(/<[^>]+>/g, ""))) {
    // No raw placeholder text — still try with run-split-tolerant pass below
  }

  // Walk paragraphs: split on <w:p ...> ... </w:p>
  // Use a state machine to keep the boundaries intact.
  const PARA_OPEN = /<w:p(\s[^>]*)?>/g;
  const out: string[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = PARA_OPEN.exec(xml)) !== null) {
    // Pre-paragraph chunk
    if (m.index > cursor) out.push(xml.slice(cursor, m.index));
    const openTagEnd = m.index + m[0].length;
    const closeIdx = xml.indexOf("</w:p>", openTagEnd);
    if (closeIdx === -1) {
      // Malformed; bail out and emit the rest verbatim
      out.push(xml.slice(m.index));
      cursor = xml.length;
      break;
    }
    const inner = xml.slice(openTagEnd, closeIdx);
    out.push(m[0]);
    out.push(rewriteParagraphInner(inner, fields));
    out.push("</w:p>");
    cursor = closeIdx + "</w:p>".length;
    PARA_OPEN.lastIndex = cursor;
  }
  if (cursor < xml.length) out.push(xml.slice(cursor));
  return out.join("");
}

export function replaceKnownTemplateTextInDocxXml(xml: string, fields: FieldsMap): string {
  const PARA_OPEN = /<w:p(\s[^>]*)?>/g;
  const out: string[] = [];
  const state: PlainState = {
    creditCodeCount: 0,
    addressCount: 0,
    contactPhoneCount: 0,
    emailCount: 0,
  };
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
    out.push(m[0]);
    out.push(rewriteKnownTemplateParagraphInner(inner, fields, state));
    out.push("</w:p>");
    cursor = closeIdx + "</w:p>".length;
    PARA_OPEN.lastIndex = cursor;
  }
  if (cursor < xml.length) out.push(xml.slice(cursor));
  return out.join("");
}

function rewriteParagraphInner(inner: string, fields: FieldsMap): string {
  // Concatenate text from all <w:t>...</w:t>
  const TEXT_RE = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let concatenated = "";
  const matches: { start: number; end: number; text: string }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = TEXT_RE.exec(inner)) !== null) {
    concatenated += mm[2];
    matches.push({ start: mm.index, end: mm.index + mm[0].length, text: mm[2] });
  }
  if (matches.length === 0) return inner;

  // Look for placeholders in the concatenated text
  if (!/\{\{[\w.]+\}\}/.test(concatenated)) return inner;

  const replaced = concatenated.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => {
    if (key in fields) {
      const v = display(fields[key]);
      return v;
    }
    return ""; // unknown placeholders become empty (so blank lines collapse, not show {{...}})
  });

  // Strategy: put the entire replaced text into the FIRST <w:t> run; blank out subsequent ones.
  const firstMatch = matches[0];
  const result: string[] = [];
  result.push(inner.slice(0, firstMatch.start));
  // Reuse the first w:t's opening tag (which may carry attributes like xml:space="preserve")
  const openTagMatch = inner.slice(firstMatch.start, firstMatch.end).match(/^<w:t(\s[^>]*)?>/);
  const openTag = openTagMatch ? openTagMatch[0] : "<w:t>";
  // Always preserve whitespace (the replacement may have spaces at edges)
  const preservedOpen = openTag.includes("xml:space=")
    ? openTag
    : openTag.replace(/^<w:t/, `<w:t xml:space="preserve"`);
  result.push(`${preservedOpen}${escXml(replaced)}</w:t>`);

  // Fill the gaps between text nodes with the surrounding xml + blank out the other w:t nodes
  let lastEnd = firstMatch.end;
  for (let i = 1; i < matches.length; i++) {
    const ti = matches[i];
    result.push(inner.slice(lastEnd, ti.start));
    // emit an empty w:t (preserving attributes)
    const om = inner.slice(ti.start, ti.end).match(/^<w:t(\s[^>]*)?>/);
    const oTag = om ? om[0] : "<w:t>";
    result.push(`${oTag}</w:t>`);
    lastEnd = ti.end;
  }
  result.push(inner.slice(lastEnd));
  return result.join("");
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

function rewriteKnownTemplateParagraphInner(
  inner: string,
  fields: FieldsMap,
  state: PlainState,
): string {
  const matches = textMatches(inner);
  if (matches.length === 0) return inner;
  const concatenated = matches.map((m) => m.text).join("");
  const replacement = replacementForTemplateText(concatenated, fields, state);
  if (replacement === null) return inner;

  const firstMatch = matches[0];
  const result: string[] = [];
  result.push(inner.slice(0, firstMatch.start));
  const openTagMatch = inner.slice(firstMatch.start, firstMatch.end).match(/^<w:t(\s[^>]*)?>/);
  const openTag = openTagMatch ? openTagMatch[0] : "<w:t>";
  const preservedOpen = openTag.includes("xml:space=")
    ? openTag
    : openTag.replace(/^<w:t/, `<w:t xml:space="preserve"`);
  result.push(`${preservedOpen}${escXml(replacement)}</w:t>`);

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

/** Fill a docx template buffer with the given fields and return the new docx buffer. */
export async function fillContractTemplate(
  templateBuffer: Buffer,
  fields: FieldsMap
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("模板文件结构异常：找不到 word/document.xml");
  const xml = await docFile.async("string");
  const newXml = stripOutputBackgrounds(
    replaceKnownTemplateTextInDocxXml(
      replaceMustacheInDocxXml(xml, fields),
      fields,
    ),
  );
  zip.file("word/document.xml", newXml);

  // Headers / footers may also carry placeholders.
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

/** Convenience: read a template by absolute server path and fill it. */
export async function fillContractTemplateFromPath(
  absPath: string,
  fields: FieldsMap
): Promise<Buffer> {
  const buf = fs.readFileSync(absPath);
  return fillContractTemplate(buf, fields);
}

/** Resolve a stored fileUrl (e.g. "/contract-templates/abc.docx") to an absolute disk path. */
export function templateUrlToAbsPath(fileUrl: string): string {
  const rel = fileUrl.replace(/^\//, "");
  return path.join(process.cwd(), "public", rel);
}
