// Party B (the service provider, "乙方") fixed identities. Selecting a company
// in the contract form auto-fills 7 fields; selecting bank accounts adds them
// to the contract document.
//
// Per spec: 佛山灵跃 has no 法定代表人 — that line is intentionally omitted.

export type PartyBCompanyKey = "THRAIVE" | "LINGYUE";
export type PartyBBankKey = "THRAIVE_BANK" | "LINGYUE_BANK";

export interface PartyBCompanyInfo {
  key: PartyBCompanyKey;
  label: string;                     // 显示名（短）
  name: string;                      // 乙方签约主体公司名称
  creditCode: string;                // 统一社会信用代码
  legalRep: string | null;           // 法定代表人 (灵跃 = null)
  address: string;
  contact: string;
  phone: string;
  email: string;
  defaultBank: PartyBBankKey;        // 选公司时默认勾上的账户
}

export const PARTY_B_COMPANIES: Record<PartyBCompanyKey, PartyBCompanyInfo> = {
  THRAIVE: {
    key: "THRAIVE",
    label: "THRAIVE（香港）",
    name: "HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED",
    creditCode: "80456388",
    legalRep: "温志倩",
    address: "RM 29-33 5/F BEVERLEY COMMCTR 87-105 CHATHAM RD TSIMSHA TSUIHONG KONG",
    contact: "胡铭",
    phone: "18721724179",
    email: "ledo.h@thraiveagency.com",
    defaultBank: "THRAIVE_BANK",
  },
  LINGYUE: {
    key: "LINGYUE",
    label: "佛山灵跃（佛山）",
    name: "佛山市灵跃出海品牌策划有限公司",
    creditCode: "91440606MAEMCQTB37",
    legalRep: null,
    address: "佛山市顺德区大良街道北区新桂北路192号铺",
    contact: "胡铭",
    phone: "18721724179",
    email: "ledo.h@thraiveagency.com",
    defaultBank: "LINGYUE_BANK",
  },
};

export interface PartyBBankInfo {
  key: PartyBBankKey;
  label: string;
  ownerKey: PartyBCompanyKey;         // 归属公司（用于"二选一"时默认勾选）
  accountName: string;
  bankName: string;
  accountNo: string;
  swift: string | null;
}

export const PARTY_B_BANKS: Record<PartyBBankKey, PartyBBankInfo> = {
  THRAIVE_BANK: {
    key: "THRAIVE_BANK",
    label: "THRAIVE 收款账户（Citibank, USD）",
    ownerKey: "THRAIVE",
    accountName: "HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO LIMITED",
    bankName: "Citibank",
    accountNo: "70581350002448827",
    swift: "CITIUS33",
  },
  LINGYUE_BANK: {
    key: "LINGYUE_BANK",
    label: "佛山灵跃 收款账户（中国银行顺德大良，CNY）",
    ownerKey: "LINGYUE",
    accountName: "佛山市灵跃出海品牌策划有限公司",
    bankName: "中国银行股份有限公司顺德大良支行",
    accountNo: "678280396031",
    swift: null,
  },
};

/** Parse the stored JSON array safely; returns valid PartyBBankKey list. */
export function parsePartyBBanks(raw: unknown): PartyBBankKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is PartyBBankKey => k === "THRAIVE_BANK" || k === "LINGYUE_BANK");
}
