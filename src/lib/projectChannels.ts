// Defaults + helpers for project GMV channel targets.
// 第一期范围：默认 5 个渠道（用户可选改名/删/加）；货币符号映射。

export const DEFAULT_CHANNELS = [
  "Media Buyer目标",
  "PR目标",
  "Deal目标",
  "Creator",
  "ACC",
] as const;

export const CURRENCY_OPTIONS = ["USD", "GBP", "EUR", "RMB"] as const;
export type Currency = (typeof CURRENCY_OPTIONS)[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  RMB: "¥",
};

export function currencySymbol(c: string | null | undefined): string {
  if (!c) return "";
  return CURRENCY_SYMBOLS[c as Currency] ?? c;
}

/** Format a numeric amount with currency symbol. Returns "—" for null/0 toggle as caller decides. */
export function formatMoney(amount: number, currency: string): string {
  const sym = currencySymbol(currency);
  const fixed = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${sym}${fixed}`;
}
