import fs from "fs";
import path from "path";
import JSZip from "jszip";
import {
  currencySymbol,
  parseCommissionConfig,
  percentText,
  type TieredCommissionRule,
} from "@/lib/contractCommissionConfig";

export type FieldsMap = Record<string, string | number | null | undefined>;

function escXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function cycleText(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.includes("季")) return "季度";
  return "月度";
}

function productText(raw: string): string {
  return raw.trim() || "详见双方确认清单";
}

function selectedChannelKeys(fields: FieldsMap): Set<string> {
  const raw = field(fields, "coopChannelKeys") || field(fields, "coopChannels");
  return new Set(raw.split(/[,，、]/).map((v) => v.trim()).filter(Boolean));
}

function channelLine(fields: FieldsMap, key: string, label: string): string {
  return `${selectedChannelKeys(fields).has(key) ? "☑" : "□"} ${label}`;
}

function tierLines(tiers: TieredCommissionRule[], currency: string): string {
  const symbol = currencySymbol(currency);
  if (!tiers.length) return `0-${symbol}____：____%`;
  return tiers
    .map((tier) => {
      const from = tier.from?.trim() || "0";
      const to = tier.to?.trim();
      const rate = percentText(tier.rate);
      return to
        ? `${symbol}${from}-${symbol}${to}：${rate}`
        : `${symbol}${from}及以上：${rate}`;
    })
    .join("\n");
}

function specialCommissionText(fields: FieldsMap): string {
  const config = parseCommissionConfig(field(fields, "commissionConfig"));
  const special = config.special;
  const attributionRate = percentText(special?.attributionRate || field(fields, "commissionRate"));
  const creatorRate = percentText(special?.creatorRate);
  const lowThreshold = special?.lowGmvThreshold || "______";
  const lowBudgetRate = percentText(special?.lowGmvBudgetRate || "15");
  const highThreshold = special?.highGmvThreshold || lowThreshold;
  const highServiceRate = percentText(special?.highGmvServiceRate);
  const confirmDays = special?.stockPublisherConfirmDays || "10";
  return [
    "除月度服务费外，甲方应按照本协议约定的【特殊佣金机制】，以乙方服务期间产生的联盟归因GMV为计算基础，向乙方支付相应服务佣金。",
    "（1）Amazon Attribution（归因链接）渠道佣金",
    `甲方应按照该渠道有效归因GMV的 ${attributionRate || "______%"} 向乙方支付服务佣金。`,
    "（2）Amazon Creator Connections（创作者计划）渠道佣金",
    `由乙方创建、管理或运营的 Campaign 所产生的有效归因销售额，甲方应按照 ${creatorRate || "______%"} 向乙方支付服务佣金。`,
    "（3）历史资源确认",
    `双方应于项目启动后【${confirmDays}】个工作日内，共同确认《存量Publisher资源表》。`,
    "（4）历史资源移交",
    "自移交日期起，由乙方实际创建、管理或运营的Campaign所产生的有效归因销售额，按照本项目确认书约定的创作者计划佣金规则进行结算。",
    "（5）新增Publisher佣金规则",
    `A. 单个Publisher在单个Campaign项下当月有效归因GMV低于 USD ${lowThreshold} 的：甲方同意将该Publisher对应有效归因GMV的 ${lowBudgetRate || "______%"} 作为渠道推广预算。`,
    `B. 单个Publisher在单个Campaign项下当月有效归因GMV达到或超过 USD ${highThreshold} 的：甲方应按照该Publisher对应有效归因GMV的 ${highServiceRate || "______%"} 向乙方支付服务佣金。`,
  ].join("\n");
}

function commissionLine(fields: FieldsMap): string {
  const config = parseCommissionConfig(field(fields, "commissionConfig"));
  const templateKey = config.templateKey || field(fields, "templateKey") || field(fields, "commissionType");
  if (templateKey === "THRESHOLD") {
    const threshold = config.threshold;
    const currency = threshold?.currency || field(fields, "thresholdCurrency") || "USD";
    const amount = threshold?.amount || field(fields, "thresholdAmount") || "_____";
    const reached = percentText(threshold?.reachedRate || field(fields, "commissionRate"));
    const unreached = percentText(threshold?.unreachedRate);
    return `除月度服务费外，甲方应按照本协议约定的【联盟归因GMV门槛佣金机制】，以乙方服务期间产生的联盟归因GMV为计算基础，向乙方支付相应服务佣金。当联盟归因GMV达到 ${currencySymbol(currency)}${amount} 后，甲方应按照全部已产生的联盟归因GMV向乙方支付联盟归因GMV的 ${reached || "______%"} 作为服务佣金。未达到上述联盟归因GMV门槛时，甲方应按照全部已产生的联盟归因GMV向乙方支付联盟归因GMV的 ${unreached || "______%"} 作为服务佣金。`;
  }
  if (templateKey === "TIERED") {
    const tiered = config.tiered;
    const currency = tiered?.currency || "USD";
    return `除月度服务费外，甲方应按照本协议约定的【阶梯式联盟归因GMV佣金机制】，以乙方服务期间产生的联盟归因GMV为计算基础，向乙方支付相应服务佣金。\n联盟归因GMV佣金按照以下阶梯式区间的方式支付：\n联盟归因GMV区间（币种：${currency}）        佣金比例\n${tierLines(tiered?.tiers ?? [], currency)}`;
  }
  if (templateKey === "INCREMENTAL") {
    const incremental = config.incremental;
    const baseMonths = incremental?.baseMonths || field(fields, "excessBaseMonths") || "_____";
    const rate = percentText(incremental?.excessRate || field(fields, "excessCommissionRate") || field(fields, "commissionRate"));
    return `除月度服务费外，甲方应按照本协议约定的【超额联盟归因GMV佣金机制】，以乙方服务期间产生的联盟归因GMV为计算基础，向乙方支付相应服务佣金。以合作开始前最近 ${baseMonths} 个月平均联盟GMV作为基准值。对于合作开始后，月度联盟归因GMV超出基准值部分，甲方向乙方支付 ${rate || "______%"} 作为增长服务佣金。`;
  }
  if (templateKey === "SPECIAL") {
    return specialCommissionText(fields);
  }
  const rate = percentText(config.fixed?.rate || field(fields, "commissionRate"));
  return `除月度服务费外，甲方应向乙方支付联盟归因GMV佣金，甲方向乙方按照固定点数联盟归因GMV的 ${rate || "_____%"} 作为服务佣金。`;
}

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

  if (trimmed.startsWith("推广平台：")) return `推广平台：${field(fields, "promoPlatform") || "亚马逊（Amazon）"}`;
  if (trimmed.startsWith("目标站点：")) return `目标站点：${field(fields, "targetSite")}`;
  if (trimmed.startsWith("推广商品清单：")) return `推广商品清单：${productText(field(fields, "productListText"))}`;
  if (compact.includes("甲方每个月按照") && compact.includes("作为月度服务费")) {
    return `甲方每个月按照${field(fields, "feeCurrency")} ${field(fields, "feeAmount")} 元/月作为月度服务费。`;
  }
  if (trimmed.startsWith("服务费按")) {
    return `服务费按 ${cycleText(field(fields, "feeCycle")) || "月度"} 预付。`;
  }
  if (compact.includes("联盟归因GMV佣金按") && compact.includes("结算")) {
    return `联盟归因GMV佣金按${cycleText(field(fields, "gmvSettlementCycle")) || "月度"}结算。`;
  }
  if (
    compact.includes("固定点数联盟归因GMV")
    || compact.includes("阶梯式联盟归因GMV佣金机制")
    || compact.includes("联盟归因GMV门槛佣金机制")
    || compact.includes("超额联盟归因GMV佣金机制")
    || compact.includes("特殊佣金机制")
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
  const newXml = stripOutputBackgrounds(
    replaceKnownTemplateTextInDocxXml(
      replaceMustacheInDocxXml(xml, fields),
      fields,
    ),
  );
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
