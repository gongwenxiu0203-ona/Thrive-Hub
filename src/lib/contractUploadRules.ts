export interface UploadedPartyBComparison {
  company?: string;
  creditCode?: string;
  address?: string;
  contact?: string;
  phone?: string;
  email?: string;
}

export interface UploadedPaymentAccount {
  companyType: "FOSHAN" | "HONGKONG" | "UNKNOWN";
  usage?: string;
  accountName?: string;
  bankName?: string;
  bankAccountNo?: string;
  swiftCode?: string;
  status: "COMPLETE" | "NEEDS_CONFIRMATION";
  rawText: string;
}

export interface UploadRuleExtraction {
  fields: Record<string, unknown>;
  partyBComparison: UploadedPartyBComparison;
  paymentAccounts: UploadedPaymentAccount[];
}

const CHANNEL_KEYWORDS: Array<[string, string[]]> = [
  ["ACC", ["Amazon Creator Connections", "Creator Connections", "创作者计划", "ACC"]],
  ["Attribution", ["Amazon Attribution", "归因链接", "Attribution"]],
  ["Associates", ["Amazon Associates", "Affiliate联盟", "Associates"]],
  ["AmazonLive", ["Amazon Live"]],
  ["Levanta", ["Levanta"]],
  ["Impact", ["Impact"]],
  ["Wayward", ["Wayward"]],
  ["ArcherAffiliates", ["Archer Affiliates"]],
  ["PartnerBoost", ["PartnerBoost"]],
];

export function extractContractFieldsByRules(text: string): UploadRuleExtraction {
  const normalized = normalizeText(text);
  const fields: Record<string, unknown> = {};

  assign(fields, "partyAName", matchValue(normalized, /甲方\s*[（(]\s*客户\s*[）)]\s*[:：]?\s*([^\n]+)/));
  assign(fields, "partyACreditCode", matchValue(normalized, /甲方[\s\S]{0,160}?统一社会信用代码[\/／]?商业登记号\s*[:：;；]?\s*([A-Z0-9]{8,30})/i));

  const partyBComparison: UploadedPartyBComparison = {
    company: matchValue(normalized, /乙方\s*[（(]\s*服务方\s*[）)]\s*[:：]?\s*([^\n]+)/),
    creditCode: matchValue(normalized, /乙方[\s\S]{0,180}?统一社会信用代码[\/／]?商业登记号\s*[:：;；]?\s*([A-Z0-9]{8,30})/i),
  };

  const term = normalized.match(/合作期限自\s*(\d{4})\s*年\s*(\d{1,2})?\s*月?\s*(\d{1,2})?\s*日?\s*起?\s*至\s*(\d{4})\s*年\s*(\d{1,2})?\s*月?\s*(\d{1,2})?\s*日?/);
  if (term) {
    fields.startDate = toDate(term[1], term[2] || "1", term[3] || "1");
    fields.endDate = toDate(term[4], term[5] || "12", term[6] || "31");
  }

  const noticeBlock = sliceBetween(normalized, "双方确认的送达信息如下", "任何一方变更送达信息")
    || sliceBetween(normalized, "通知与送达", "任何一方变更送达信息")
    || "";
  const partyANotice = sliceBetween(noticeBlock, "甲方地址", "乙方地址") || "";
  const partyBNotice = noticeBlock.includes("乙方地址") ? noticeBlock.slice(noticeBlock.indexOf("乙方地址")) : "";
  assign(fields, "partyAAddress", matchValue(partyANotice, /甲方地址\s*[:：]?\s*([\s\S]*?)(?:甲方指定联系人|电话|电子邮箱)/));
  assign(fields, "partyAContact", matchValue(partyANotice, /甲方指定联系人\s*[:：]?\s*([^\n电话]+)/));
  assign(fields, "partyAPhone", matchValue(partyANotice, /电话\s*[:：]?\s*([0-9+\-\s]{5,30})/));
  assign(fields, "partyAEmail", matchValue(partyANotice, /电子邮箱\s*[:：]?\s*([^\s\n]+@[^\s\n]+)/));
  partyBComparison.address = matchValue(partyBNotice, /乙方地址\s*[:：]?\s*([\s\S]*?)(?:乙方指定联系人|电话|电子邮箱)/);
  partyBComparison.contact = matchValue(partyBNotice, /乙方指定联系人\s*[:：]?\s*([^\n电话]+)/);
  partyBComparison.phone = matchValue(partyBNotice, /电话\s*[:：]?\s*([0-9+\-\s]{5,30})/);
  partyBComparison.email = matchValue(partyBNotice, /电子邮箱\s*[:：]?\s*([^\s\n]+@[^\s\n]+)/);

  const projectBlock = extractProjectBlock(normalized);
  const contractScopeText = `${projectBlock}\n${normalized}`;
  assign(fields, "promoPlatform", detectPromoPlatform(contractScopeText));
  assign(fields, "targetSite", detectTargetSites(contractScopeText));
  assign(fields, "coopChannels", detectChannels(contractScopeText));

  const serviceFee = extractServiceFee(contractScopeText);
  if (serviceFee) {
    fields.feeCurrency = serviceFee.currency;
    fields.feeAmount = serviceFee.amount;
  }
  assign(fields, "feeCycle", detectFeeCycle(contractScopeText));

  fields.commissionType = detectCommissionType(contractScopeText);
  fields.gmvSettlementCycle = detectSettlementCycle(contractScopeText);
  applyCommissionFields(fields, contractScopeText);

  const paymentAccounts = extractPaymentAccounts(normalized);

  return {
    fields: compactObject(fields),
    partyBComparison: compactObject(partyBComparison) as UploadedPartyBComparison,
    paymentAccounts,
  };
}

export function mergeRuleAndAiFields(
  rule: UploadRuleExtraction,
  aiFields: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...rule.fields };
  for (const [key, value] of Object.entries(aiFields ?? {})) {
    if (!valueMissing(value)) merged[key] = value;
  }
  merged.__partyBComparison = rule.partyBComparison;
  merged.__paymentAccounts = rule.paymentAccounts;
  return merged;
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assign(target: Record<string, unknown>, key: string, value: unknown) {
  if (!valueMissing(value)) target[key] = value;
}

function compactObject<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => !valueMissing(value))) as Partial<T>;
}

function valueMissing(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function sliceBetween(text: string, start: string, end: string): string | null {
  const s = text.indexOf(start);
  if (s < 0) return null;
  const e = text.indexOf(end, s + start.length);
  return (e > s ? text.slice(s, e) : text.slice(s)).trim();
}

function extractProjectBlock(text: string): string {
  const start = text.lastIndexOf("项目确认书");
  if (start < 0) return text;
  const tail = text.slice(start);
  const end = tail.indexOf("本项目确认书未尽事宜");
  return (end > 0 ? tail.slice(0, end) : tail).trim();
}

function matchValue(text: string, pattern: RegExp): string | undefined {
  return cleanValue(text.match(pattern)?.[1]);
}

function cleanValue(value?: string): string | undefined {
  const next = String(value ?? "")
    .replace(/[□☐■☑✓√]/g, "")
    .replace(/^[:：;；\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return next || undefined;
}

function toDate(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeAmount(value?: string): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  let next = raw.replace(/[,，\s]/g, "");
  if (/^\d+\.\d{3}$/.test(next)) next = next.replace(".", "");
  return next;
}

function normalizeCurrency(value?: string): string | undefined {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return undefined;
  if (/人民币|RMB|CNY/.test(raw)) return "人民币";
  if (/美金|美元|USD/.test(raw)) return "美金";
  if (/欧元|EUR/.test(raw)) return "欧元";
  if (/英镑|GBP/.test(raw)) return "英镑";
  return String(value).trim();
}

function extractServiceFee(text: string): { currency: string; amount: string } | undefined {
  const line = text.match(/甲方每个月按照[^\n]{0,90}元\s*\/\s*月作为月度服务费/)?.[0]
    || text.match(/服务费金额[\s\S]{0,180}?元\s*\/\s*月/)?.[0]
    || text.match(/服务费[^，。\n]{0,20}标准为每月\s*[0-9][0-9,，.\s]*\s*(人民币|美金|美元|USD|RMB|CNY|EUR|欧元|GBP|英镑)/i)?.[0]
    || text.match(/标准为每月\s*[0-9][0-9,，.\s]*\s*(人民币|美金|美元|USD|RMB|CNY|EUR|欧元|GBP|英镑)/i)?.[0];
  if (!line) return undefined;

  const checkedCurrency = line.match(/[☑■✓√]\s*(人民币|美金|美元|USD|RMB|CNY|EUR|欧元|GBP|英镑)/i)?.[1]
    || line.match(/(人民币|美金|美元|USD|RMB|CNY|EUR|欧元|GBP|英镑)\s*[☑■✓√]/i)?.[1];
  const amount = normalizeAmount(
    line.match(/([0-9][0-9,，.\s]*)\s*元\s*\/\s*月/)?.[1]
      || line.match(/每月\s*([0-9][0-9,，.\s]*)\s*(?:人民币|美金|美元|USD|RMB|CNY|EUR|欧元|GBP|英镑)/i)?.[1],
  );
  const fallbackCurrency = line.match(/(人民币|美金|美元|USD|RMB|CNY|EUR|欧元|GBP|英镑)/i)?.[1];
  const currency = normalizeCurrency(checkedCurrency || fallbackCurrency);
  if (!amount || !currency) return undefined;
  return { currency, amount };
}

function detectFeeCycle(text: string): string | undefined {
  if (/服务费按[^\n]{0,20}[☑■✓√]\s*季度/.test(text)) return "季度预付";
  if (/服务费按[^\n]{0,20}[☑■✓√]\s*月/.test(text)) return "月付";
  if (/服务费按\s*月\s*\/\s*季度/.test(text)) return "月付";
  return undefined;
}

function detectPromoPlatform(text: string): string | undefined {
  const found: string[] = [];
  if (/[☑■✓√]\s*亚马逊|亚马逊\s*[（(]\s*Amazon/i.test(text)) found.push("亚马逊（Amazon）");
  if (/[☑■✓√]\s*沃尔玛|沃尔玛\s*[（(]\s*Walmart/i.test(text)) found.push("沃尔玛（Walmart）");
  return found.join("、") || undefined;
}

function detectTargetSites(text: string): string | undefined {
  const sites = ["美国站", "加拿大", "德国站", "英国站", "法国", "西班牙", "意大利", "澳洲", "日本"];
  const found = sites.filter((site) => new RegExp(`[☑■✓√]\\s*${site}`).test(text));
  return found.join("、") || undefined;
}

function detectChannels(text: string): string[] {
  return CHANNEL_KEYWORDS
    .filter(([, words]) => words.some((word) => text.includes(word) && nearChecked(text, word)))
    .map(([key]) => key);
}

function nearChecked(text: string, word: string): boolean {
  const index = text.indexOf(word);
  if (index < 0) return false;
  const nearby = text.slice(Math.max(0, index - 16), index + word.length + 16);
  return /[☑■✓√]/.test(nearby) || !/[□☐]/.test(nearby.slice(0, 6));
}

function detectCommissionType(text: string): string | undefined {
  if (/特殊佣金机制|特殊佣金/.test(text)) return "SPECIAL";
  if (/阶梯式联盟归因GMV佣金机制|阶梯式区间|阶梯/.test(text)) return "TIERED";
  if (/门槛佣金机制|达到.*门槛|未达到上述/.test(text)) return "THRESHOLD";
  if (/超额联盟归因GMV佣金机制|基准值|超出基准值/.test(text)) return "INCREMENTAL";
  return undefined;
}

function detectSettlementCycle(text: string): string | undefined {
  const section = text.match(/4\.3\s*联盟归因\s*GM(?:V|YV|Y)\s*结算周期[\s\S]{0,180}/)?.[0] || text;
  if (/[☑■✓√]\s*季度|季度\s*[☑■✓√]/.test(section)) return "季度";
  if (/[☑■✓√]\s*月|月\s*[☑■✓√]/.test(section)) return "月度";
  if (/按月\s*\/\s*季度结算|按月度结算|按月结算|按\s*月度\s*结算/.test(section)) return "月度";
  if (/按季度结算|按\s*季度\s*结算/.test(section)) return "季度";
  return undefined;
}

function applyCommissionFields(fields: Record<string, unknown>, text: string) {
  const type = String(fields.commissionType ?? "FIXED");
  if (type === "FIXED") {
    assign(fields, "commissionRate", text.match(/GM(?:V|YV|Y)\s*的\s*([0-9.]+)\s*%/)?.[1]);
  }
  if (type === "THRESHOLD") {
    const threshold = text.match(/达到\s*(人民币|美金|美元|USD|RMB|CNY|EUR|欧元|GBP|英镑)?\s*([0-9,，.]+)/i);
    assign(fields, "thresholdCurrency", normalizeCurrency(threshold?.[1]));
    assign(fields, "thresholdAmount", normalizeAmount(threshold?.[2]));
    const rates = [...text.matchAll(/GM(?:V|YV|Y)\s*的\s*([0-9.]+)\s*%/g)].map((m) => m[1]);
    assign(fields, "thresholdReachedRate", rates[0]);
    assign(fields, "thresholdUnreachedRate", rates[1]);
  }
  if (type === "INCREMENTAL") {
    assign(fields, "excessBaseMonths", text.match(/最近\s*([0-9]+)\s*个月平均/)?.[1]);
    assign(fields, "excessCommissionRate", text.match(/超出基准值部分[^0-9]*([0-9.]+)\s*%/)?.[1]);
  }
  if (type === "SPECIAL") {
    assign(fields, "specialCommissionTerms", sliceBetween(text, "4.2", "4.3") ?? undefined);
  }
  if (type === "TIERED") {
    const currency = normalizeCurrency(text.match(/币种\s*[:：]?\s*(USD|RMB|CNY|EUR|GBP|美元|美金|人民币|欧元|英镑)/i)?.[1]) ?? "USD";
    const rows = [...text.matchAll(/([0-9,，.]+)\s*[-~至]\s*([0-9,，.]+).*?([0-9.]+)\s*%/g)]
      .map((m) => ({ from: normalizeAmount(m[1]) ?? "", to: normalizeAmount(m[2]) ?? "", rate: m[3] }));
    if (rows.length) fields.tieredRules = JSON.stringify({ currency, tiers: rows });
  }
}

function extractPaymentAccounts(text: string): UploadedPaymentAccount[] {
  const accountWindow = sliceBetween(text, "乙方指定收款账户", "乙方指定收款账户为本协议项下有效收款账户")
    || sliceBetween(text, "税费及收款信息", "乙方如需变更收款账户")
    || text;
  const accountAnchors = findAllAnchorIndexes(accountWindow, /账户名称|开户银行|银行账号|SWIFT\s*CODE|中国境内银行账户|香港收款主体|境外代收主体/g);
  if (accountAnchors.length === 0) return [];

  const blocks: string[] = [];
  for (let i = 0; i < accountAnchors.length; i += 1) {
    const start = Math.max(0, accountAnchors[i] - 120);
    const end = Math.min(accountWindow.length, (accountAnchors[i + 1] ?? accountAnchors[i] + 650) + 120);
    blocks.push(accountWindow.slice(start, end));
  }

  const accounts = blocks.map(parseAccountBlock).filter((account) => account.rawText.trim());
  const keyed = new Map<string, UploadedPaymentAccount>();
  for (const account of accounts) {
    const key = `${account.companyType}:${account.accountName ?? ""}:${account.bankAccountNo ?? ""}:${account.rawText.slice(0, 40)}`;
    keyed.set(key, account);
  }
  return [...keyed.values()];
}

function findAllAnchorIndexes(text: string, pattern: RegExp): number[] {
  return [...text.matchAll(pattern)].map((match) => match.index ?? 0);
}

function parseAccountBlock(rawText: string): UploadedPaymentAccount {
  const companyType = /HONG\s*KONG|香港|境外|SWIFT/i.test(rawText)
    ? "HONGKONG"
    : /佛山|境内|人民币/.test(rawText)
      ? "FOSHAN"
      : "UNKNOWN";
  const accountName = matchValue(rawText, /账户名称\s*[:：]?\s*([^\n]+)/) || matchValue(rawText, /收款主体\s*[:：]?\s*([^\n]+)/);
  const bankName = matchValue(rawText, /开户银行\s*[:：]?\s*([^\n]+)/);
  const bankAccountNo = matchValue(rawText, /银行账号\s*[:：]?\s*([A-Z0-9\-\s]{5,80})/i);
  const swiftCode = matchValue(rawText, /SWIFT\s*CODE\s*[（(]?如适用[）)]?\s*[:：]?\s*([A-Z0-9\-\s]{4,30})/i)
    || matchValue(rawText, /SWIFT\s*[:：]?\s*([A-Z0-9\-\s]{4,30})/i);
  const complete = Boolean(accountName && bankName && bankAccountNo);
  return {
    companyType,
    usage: /GMV|佣金/.test(rawText) ? "GMV佣金收款" : /服务费|月度/.test(rawText) ? "月度服务费收款" : undefined,
    accountName,
    bankName,
    bankAccountNo,
    swiftCode,
    status: complete ? "COMPLETE" : "NEEDS_CONFIRMATION",
    rawText: rawText.trim(),
  };
}
