// Build the {{key}} placeholder map for filling a contract template.
// Admins add these {{...}} markers to their .docx templates. Unknown placeholders
// in a template become empty string (so missing optional fields don't show
// the raw "{{...}}" to the reader).
//
// Keep this list stable: it is the public contract for template authors.

import { PARTY_B_COMPANIES, PARTY_B_BANKS, parsePartyBBanks, type PartyBBankKey } from "@/lib/partyB";

type Loose = Record<string, unknown>;

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function fmtDate(d: unknown, part?: "year" | "month" | "day"): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(s(d));
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const day = dt.getDate();
  if (part === "year") return String(y);
  if (part === "month") return String(m);
  if (part === "day") return String(day);
  return `${y}年${m}月${day}日`;
}

/**
 * Available placeholder keys. Documented per the spec so the admin knows
 * what to type in templates. The full list is exported as PLACEHOLDER_KEYS
 * for the templates UI to display.
 */
export const PLACEHOLDER_KEYS: { key: string; desc: string; group: string }[] = [
  // Contract meta
  { key: "contractNo",            desc: "合同编号",             group: "合同基础" },
  { key: "startDate",             desc: "合作开始日 (YYYY-MM-DD)", group: "合同基础" },
  { key: "endDate",               desc: "合作结束日 (YYYY-MM-DD)", group: "合同基础" },
  { key: "startYear",             desc: "合作开始-年",          group: "合同基础" },
  { key: "startMonth",            desc: "合作开始-月",          group: "合同基础" },
  { key: "startDay",              desc: "合作开始-日",          group: "合同基础" },
  { key: "endYear",               desc: "合作结束-年",          group: "合同基础" },
  { key: "endMonth",              desc: "合作结束-月",          group: "合同基础" },
  { key: "endDay",                desc: "合作结束-日",          group: "合同基础" },
  // Party A
  { key: "partyAName",            desc: "甲方公司名称",          group: "甲方信息" },
  { key: "partyACreditCode",      desc: "甲方统一社会信用代码",   group: "甲方信息" },
  { key: "partyALegalRep",        desc: "甲方法定代表人",        group: "甲方信息" },
  { key: "partyAAddress",         desc: "甲方地址",             group: "甲方信息" },
  { key: "partyAContact",         desc: "甲方指定联系人",        group: "甲方信息" },
  { key: "partyAPhone",           desc: "甲方电话",             group: "甲方信息" },
  { key: "partyAEmail",           desc: "甲方邮箱",             group: "甲方信息" },
  // Party B
  { key: "partyBName",            desc: "乙方公司名称",          group: "乙方信息" },
  { key: "partyBCreditCode",      desc: "乙方统一社会信用代码",   group: "乙方信息" },
  { key: "partyBLegalRep",        desc: "乙方法定代表人（灵跃为空）", group: "乙方信息" },
  { key: "partyBAddress",         desc: "乙方地址",             group: "乙方信息" },
  { key: "partyBContact",         desc: "乙方指定联系人",        group: "乙方信息" },
  { key: "partyBPhone",           desc: "乙方电话",             group: "乙方信息" },
  { key: "partyBEmail",           desc: "乙方邮箱",             group: "乙方信息" },
  // 收款账户（多账户时换行拼接）
  { key: "partyBBanks",           desc: "乙方收款账户（合并多个，换行）", group: "乙方账户" },
  { key: "partyBBankNames",       desc: "乙方账户-银行名（逗号分隔）",  group: "乙方账户" },
  { key: "partyBBankAccountNos",  desc: "乙方账户-账号（逗号分隔）",    group: "乙方账户" },
  // 费用
  { key: "feeAmount",             desc: "月度服务费金额",        group: "费用与佣金" },
  { key: "feeCurrency",           desc: "费用货币",             group: "费用与佣金" },
  { key: "feeCycle",              desc: "费用周期",             group: "费用与佣金" },
  { key: "commissionRate",        desc: "GMV 佣金比例",          group: "费用与佣金" },
  { key: "thresholdAmount",       desc: "门槛金额（仅门槛模板）", group: "费用与佣金" },
  { key: "thresholdCurrency",     desc: "门槛货币（仅门槛模板）", group: "费用与佣金" },
  { key: "tieredRules",           desc: "阶梯规则（原文，仅阶梯模板）", group: "费用与佣金" },
  { key: "excessBaseMonths",      desc: "增量基准月数（仅增量模板）", group: "费用与佣金" },
  { key: "excessCommissionRate",  desc: "增量佣金比例（仅增量模板）", group: "费用与佣金" },
  { key: "specialCommissionTerms", desc: "特殊佣金条款（仅 SPECIAL 模板）", group: "费用与佣金" },
  // 推广信息
  { key: "promoPlatform",         desc: "推广平台",             group: "推广信息" },
  { key: "targetSite",            desc: "目标站点",             group: "推广信息" },
  { key: "coopChannels",          desc: "合作渠道（逗号分隔）",    group: "推广信息" },
];

/** Build the placeholder map for a Prisma Contract row. Use any-cast to avoid
 *  fighting the schema's nullable types here. */
export function buildPlaceholderMap(c: Loose): Record<string, string> {
  const banks: PartyBBankKey[] = (() => {
    try { return parsePartyBBanks(JSON.parse(String(c.partyBBankAccounts ?? "[]"))); }
    catch { return []; }
  })();

  // 渲染多账户：每个账户一段（账户名 / 开户行 / 账号 / SWIFT）
  const banksText = banks
    .map((k) => {
      const b = PARTY_B_BANKS[k];
      if (!b) return "";
      const lines = [
        `账户名称：${b.accountName}`,
        `开户银行：${b.bankName}`,
        `银行账号：${b.accountNo}`,
      ];
      if (b.swift) lines.push(`SWIFT CODE：${b.swift}`);
      return lines.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  const partyBKey = String(c.partyBCompany ?? "");
  const partyB = (partyBKey === "THRAIVE" || partyBKey === "LINGYUE")
    ? PARTY_B_COMPANIES[partyBKey as "THRAIVE" | "LINGYUE"]
    : null;

  return {
    // meta
    contractNo: s(c.contractNo),
    startDate: fmtDate(c.startDate),
    endDate: fmtDate(c.endDate),
    startYear: fmtDate(c.startDate, "year"),
    startMonth: fmtDate(c.startDate, "month"),
    startDay: fmtDate(c.startDate, "day"),
    endYear: fmtDate(c.endDate, "year"),
    endMonth: fmtDate(c.endDate, "month"),
    endDay: fmtDate(c.endDate, "day"),
    // party A — DB column is `partyA`, schema-wise; mirror for both keys
    partyAName: s(c.partyA),
    partyACreditCode: s(c.partyACreditCode),
    partyALegalRep: s(c.partyALegalRep),
    partyAAddress: s(c.partyAAddress),
    partyAContact: s(c.partyAContact),
    partyAPhone: s(c.partyAPhone),
    partyAEmail: s(c.partyAEmail),
    // party B (auto from selected company)
    partyBName: partyB?.name ?? s(c.partyBCompany),
    partyBCreditCode: partyB?.creditCode ?? "",
    partyBLegalRep: partyB?.legalRep ?? "",
    partyBAddress: partyB?.address ?? "",
    partyBContact: partyB?.contact ?? "",
    partyBPhone: partyB?.phone ?? "",
    partyBEmail: partyB?.email ?? "",
    // banks
    partyBBanks: banksText,
    partyBBankNames: banks.map((k) => PARTY_B_BANKS[k]?.bankName).filter(Boolean).join("、"),
    partyBBankAccountNos: banks.map((k) => PARTY_B_BANKS[k]?.accountNo).filter(Boolean).join("、"),
    // fees
    feeAmount: s(c.feeAmount),
    feeCurrency: s(c.feeCurrency),
    feeCycle: s(c.feeCycle),
    commissionRate: s(c.commissionRate),
    thresholdAmount: s(c.thresholdAmount),
    thresholdCurrency: s(c.thresholdCurrency),
    tieredRules: s(c.tieredRules),
    excessBaseMonths: s(c.excessBaseMonths),
    excessCommissionRate: s(c.excessCommissionRate),
    specialCommissionTerms: s(c.specialCommissionTerms),
    // promo
    promoPlatform: s(c.promoPlatform),
    targetSite: s(c.targetSite),
    coopChannels: (() => {
      try {
        const arr = JSON.parse(s(c.coopChannels ?? "[]"));
        return Array.isArray(arr) ? arr.join("、") : "";
      } catch { return ""; }
    })(),
  };
}
