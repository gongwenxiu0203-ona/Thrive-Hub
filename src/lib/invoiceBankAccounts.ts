export type InvoiceBankAccount = {
  key: string;
  label: string;
  beneficiary: string;
  bankName: string;
  bankAddress?: string;
  swiftCode?: string;
  accountNo: string;
};

/**
 * Invoice bank-account choices are copied into Invoice.bankSnapshot when an
 * invoice is saved. The snapshot, rather than this mutable catalogue, is what
 * an issued invoice renders.
 */
export const INVOICE_BANK_ACCOUNTS: Record<string, InvoiceBankAccount> = {
  THRAIVE_CCB_BANK: {
    key: "THRAIVE_CCB_BANK",
    label: "THRAIVE 收款账户（中国建设银行亚洲，USD）",
    beneficiary: "HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED",
    bankName: "China Construction Bank (Asia) Corporation Limited",
    bankAddress: "20/F, CCB Centre, 18 Wang Chiu Road, Kowloon Bay, Kowloon",
    swiftCode: "CCBQHKAX / CCBQHKAXXXX / CCBQHKAXWHS",
    accountNo: "846210550871",
  },
  THRAIVE_CITIBANK: {
    key: "THRAIVE_CITIBANK",
    label: "THRAIVE 收款账户（Citibank，USD）",
    beneficiary: "HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED",
    bankName: "Citibank",
    bankAddress: "111 Wall Street, New York, NY 10043, USA",
    swiftCode: "CITIUS33",
    accountNo: "70581350002448827",
  },
  LINGYUE_BANK: {
    key: "LINGYUE_BANK",
    label: "佛山灵跃收款账户（中国银行顺德大良，CNY）",
    beneficiary: "佛山市灵跃出海品牌策划有限公司",
    bankName: "中国银行股份有限公司顺德大良支行",
    accountNo: "678280396031",
  },
};

/** Historical contracts stored THRAIVE_BANK for the Citibank account. */
export function normalizeInvoiceBankKey(key: string): string {
  return key === "THRAIVE_BANK" ? "THRAIVE_CITIBANK" : key;
}

export function invoiceBankAccountForKey(
  key: string,
): InvoiceBankAccount | null {
  return INVOICE_BANK_ACCOUNTS[normalizeInvoiceBankKey(key)] ?? null;
}
