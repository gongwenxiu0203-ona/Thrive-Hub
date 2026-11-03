/** Shared, explicit bank-details whitelist. Never expose creator or internal metadata. */
export type FinancePayeeData = {
  name?: string | null; label?: string | null; accountType?: string | null;
  accountName?: string | null; bankName?: string | null; accountNumber?: string | null;
  currency?: string | null; country?: string | null; swiftCode?: string | null;
  bankAddress?: string | null; payeeAddress?: string | null; routingNumber?: string | null;
  bankAccountType?: string | null; accountHolderType?: string | null;
  accountHolderMobile?: string | null; accountHolderEmail?: string | null; note?: string | null;
};

export function isPayeeCategoryAllowed(requestType: string, accountType?: string | null) {
  const categories: Record<string, string[]> = {
    CHANNEL: ["CHANNEL_PAYEE"], AFFILIATE: ["AFFILIATE_PAYEE"],
    SUPPLIER: ["SUPPLIER_PAYEE", "SUPPLIER_BANK"],
  };
  const allowed = categories[requestType.toUpperCase()];
  return !allowed || allowed.includes((accountType || "").toUpperCase());
}

export function createPayeeSnapshot(account: FinancePayeeData): FinancePayeeData {
  return {
    name: account.name ?? account.label ?? null, accountType: account.accountType ?? null,
    country: account.country ?? null, bankName: account.bankName ?? null,
    routingNumber: account.routingNumber ?? null, bankAddress: account.bankAddress ?? null,
    accountHolderType: account.accountHolderType ?? null, currency: account.currency ?? null,
    accountName: account.accountName ?? null, accountNumber: account.accountNumber ?? null,
    bankAccountType: account.bankAccountType ?? null, accountHolderMobile: account.accountHolderMobile ?? null,
    accountHolderEmail: account.accountHolderEmail ?? null, payeeAddress: account.payeeAddress ?? null,
    swiftCode: account.swiftCode ?? null, note: account.note ?? null,
  };
}

export function financePayeeDetails(input: unknown): Array<{ label: string; value: string }> {
  let account: Record<string, unknown> = {};
  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) account = parsed;
  } catch { /* Legacy invalid snapshots remain readable, without invented values. */ }
  const text = (key: string) => typeof account[key] === "string" && account[key].trim() ? account[key] as string : "—";
  const holder = text("accountHolderType");
  const fields: Array<[string, string]> = [
    ["收款资料名称", text("name") === "—" ? text("label") : text("name")],
    ["Bank Country/Region 银行所在国家或地区", text("country")],
    ["Bank Name 银行全称", text("bankName")],
    ["Routing Number (ABA) 银行代码", text("routingNumber")],
    ["Bank Address 银行地址", text("bankAddress")],
    ["Bank account type 银行账户类型", holder === "personal" ? "个人 personal" : holder === "business" ? "企业 business" : holder],
    ["Bank account currency 银行账户币种", text("currency")],
    ["Account Holder Name 账户持有人名称", text("accountName")],
    ["Account Number 银行账号", text("accountNumber")],
    ["Account Type 账户类型", text("bankAccountType")],
    ["Account Holder Mobile Number 账户持有人手机号", text("accountHolderMobile")],
    ["Account Holder Email Address 账户持有人邮箱", text("accountHolderEmail")],
    ["Beneficiary Address 账户持有人地址和邮政编码", text("payeeAddress")],
    ["SWIFT Code", text("swiftCode")], ["收款账户备注", text("note")],
  ];
  return fields.map(([label, value]) => ({ label, value }));
}
