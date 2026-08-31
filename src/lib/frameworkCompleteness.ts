import { PARTY_B_COMPANIES } from "./partyB";

type MasterFields = Partial<Record<"partyA" | "partyACreditCode" | "partyAAddress" | "partyAContact" | "partyAEmail" | "partyAPhone" | "partyBCompany" | "partyBContact" | "partyBEmail" | "partyBPhone", string | null>>;

/** New-format master requirements only. Legacy fee fields never participate. */
export function frameworkMissingFields(master: MasterFields, accountCount: number): string[] {
  const fields: [keyof MasterFields, string][] = [
    ["partyA", "甲方公司名称"], ["partyACreditCode", "甲方信用代码/商业登记号（无则填不适用）"],
    ["partyAAddress", "甲方地址"], ["partyAContact", "甲方联系人"], ["partyAEmail", "甲方邮箱"],
    ["partyAPhone", "甲方电话"], ["partyBContact", "乙方对接人"], ["partyBEmail", "乙方邮箱"], ["partyBPhone", "乙方电话"],
  ];
  const missing = fields.filter(([key]) => !master[key]?.trim()).map(([, label]) => label);
  if (!master.partyBCompany || !Object.hasOwn(PARTY_B_COMPANIES, master.partyBCompany)) missing.push("乙方签约主体");
  if (accountCount < 1) missing.push("乙方收款账户");
  for (const [key, label] of [["partyAEmail", "甲方邮箱"], ["partyBEmail", "乙方邮箱"]] as const) {
    const value = master[key]?.trim();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) missing.push(`${label}格式`);
  }
  return missing;
}
