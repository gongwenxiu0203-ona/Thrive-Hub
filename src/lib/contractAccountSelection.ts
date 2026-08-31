import { PARTY_B_COMPANIES, type PartyBCompanyKey } from "./partyB";

type CompanyAccount = { id: string; legalEntity: string; legalEntityKey?: string | null };
const identity = (value: string) => value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9\u3400-\u9FFF]/g, "");

/** Defaults only: every active company account remains available for manual selection. */
export function defaultContractAccountIds(accounts: CompanyAccount[], companyKey: string): string[] {
  if (!Object.hasOwn(PARTY_B_COMPANIES, companyKey)) return [];
  const company = PARTY_B_COMPANIES[companyKey as PartyBCompanyKey];
  const names = new Set([identity(company.name), identity(company.key)]);
  return accounts.filter(account => account.legalEntityKey
    ? account.legalEntityKey === companyKey
    : names.has(identity(account.legalEntity))).map(account => account.id);
}
