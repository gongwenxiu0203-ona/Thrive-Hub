import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const REGION_CURRENCY: Record<string, string> = {
  US: "USD",
  CA: "USD",
  UK: "GBP",
  DE: "EUR",
  JP: "JPY",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  AU: "AUD",
};

export function getCurrencyCode(regions: string[]): string {
  if (regions.length === 1) return REGION_CURRENCY[regions[0]] ?? "USD";
  return "USD";
}

export function formatCurrencyWith(n: number | null | undefined, currencyCode = "USD"): string {
  if (n == null) return currencyCode === "JPY" ? "¥0" : `${currencySymbol(currencyCode)}0`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: currencyCode === "JPY" ? 0 : 2,
  }).format(n);
}

export function currencySymbol(code: string): string {
  return ({ USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$" } as Record<string, string>)[code] ?? "$";
}

export function formatCurrency(n: number | null | undefined): string {
  return formatCurrencyWith(n, "USD");
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "0";
  return new Intl.NumberFormat("en-US").format(n);
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  const diff = date.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function toInputDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}
