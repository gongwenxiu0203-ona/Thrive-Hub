import * as XLSX from "xlsx";

type ProjectSourcePlatform = {
  code: string;
  name: string;
  amountColumns: readonly string[];
  dateColumns: readonly string[];
  defaultCurrency: string;
  firstRowSummary?: boolean;
};

export const PROJECT_SOURCE_PLATFORMS = [
  { code: "acc", name: "ACC", amountColumns: ["Sales"], dateColumns: ["date"], defaultCurrency: "USD" },
  { code: "levanta", name: "Levanta", amountColumns: ["sales"], dateColumns: ["date"], defaultCurrency: "USD" },
  { code: "wayward-cc", name: "Wayward-CC", amountColumns: ["ccSales"], dateColumns: ["date"], defaultCurrency: "USD" },
  { code: "wayward-attribution", name: "Wayward-attribution", amountColumns: ["GMV"], dateColumns: ["date"], defaultCurrency: "USD" },
  { code: "lingxing-acc", name: "领星（ACC）", amountColumns: ["销售额"], dateColumns: ["date"], defaultCurrency: "USD", firstRowSummary: true },
] as const satisfies readonly ProjectSourcePlatform[];

export type ProjectSourceSnapshot = {
  platform: string;
  platformName: string;
  dataMonth: string;
  amount: number;
  currency: string;
  rowCount: number;
  matchedCount: number;
  amountColumnName: string;
  dateColumnName: string | null;
  processedAt: string;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

function resolveColumn(rows: Record<string, unknown>[], candidates: readonly string[]) {
  const columns = Object.keys(rows[0] ?? {});
  for (const candidate of candidates) {
    if (columns.includes(candidate)) return candidate;
    const match = columns.find((column) => column.trim().toLowerCase() === candidate.toLowerCase());
    if (match) return match;
  }
  return null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/\b(?:CA|US|AU|NZ|HK|SG|MX|BR|CL|CO|AR)\s*\$/gi, "")
    .replace(/[\s,$¥€£#₩₹]/g, "")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowMonth(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})[-/.年]\s*(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}`;
  match = text.match(/^(\d{4})(\d{2})\d{2}$/);
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) return `${match[1]}-${match[2]}`;
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}`;
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) return `${2000 + Number(match[3])}-${match[1].padStart(2, "0")}`;
  const lower = text.toLowerCase();
  match = lower.match(/^([a-z]{3})\s*\d{1,2},?\s*(\d{2}|\d{4})/);
  if (match && MONTHS[match[1]]) return `${match[2].length === 2 ? 2000 + Number(match[2]) : match[2]}-${MONTHS[match[1]]}`;
  match = lower.match(/^\d{1,2}[\s-]([a-z]{3})[\s-](\d{2}|\d{4})/);
  if (match && MONTHS[match[1]]) return `${match[2].length === 2 ? 2000 + Number(match[2]) : match[2]}-${MONTHS[match[1]]}`;
  match = lower.match(/^([a-z]{3})[\s-](\d{2}|\d{4})/);
  if (match && MONTHS[match[1]]) return `${match[2].length === 2 ? 2000 + Number(match[2]) : match[2]}-${MONTHS[match[1]]}`;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}` : null;
}

function detectCurrency(rows: Record<string, unknown>[], amountColumn: string, fallback: string) {
  const counts = new Map<string, number>();
  const add = (currency: string) => counts.set(currency, (counts.get(currency) ?? 0) + 1);
  for (const row of rows.slice(0, 100)) {
    const text = String(row[amountColumn] ?? "").trim();
    const explicit = text.match(/\b(USD|CNY|RMB|EUR|GBP|CAD|AUD|NZD|HKD|SGD|MXN|JPY|KRW|INR)\b/i)?.[1]?.toUpperCase();
    if (explicit) { add(explicit === "RMB" ? "CNY" : explicit); continue; }
    const prefixes: Array<[RegExp, string]> = [[/^CA\s*\$/i,"CAD"],[/^AU\s*\$/i,"AUD"],[/^NZ\s*\$/i,"NZD"],[/^HK\s*\$/i,"HKD"],[/^SG\s*\$/i,"SGD"],[/^US\s*\$/i,"USD"],[/^MX\s*\$/i,"MXN"]];
    const prefix = prefixes.find(([re]) => re.test(text));
    if (prefix) { add(prefix[1]); continue; }
    if (text.includes("€")) add("EUR"); else if (text.includes("£")) add("GBP"); else if (text.includes("¥") || text.includes("￥")) add("CNY"); else if (text.includes("₩")) add("KRW"); else if (text.includes("₹")) add("INR"); else if (text.includes("$")) add("USD");
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

export function processProjectSourceFile(buffer: Buffer, platformCode: string, dataMonth: string, forceCurrency?: string): ProjectSourceSnapshot {
  if (!MONTH_RE.test(dataMonth)) throw new Error("数据月份格式无效。");
  const platform = PROJECT_SOURCE_PLATFORMS.find((item) => item.code === platformCode);
  if (!platform) throw new Error("该数据来源尚未配置金额列映射。");
  const isCsv = false; // XLSX 会按文件内容自动识别；CSV 也由同一入口处理。
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: !isCsv });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("文件中没有可读取的工作表。");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  if (!rows.length) throw new Error("文件中没有数据行。");
  const amountColumn = resolveColumn(rows, platform.amountColumns);
  if (!amountColumn) throw new Error(`未找到金额列：${platform.amountColumns.join(" / ")}。`);
  const dateColumn = resolveColumn(rows, platform.dateColumns);
  const matchedRows = dateColumn ? rows.filter((row) => rowMonth(row[dateColumn]) === dataMonth) : rows;
  const firstRowSummary = "firstRowSummary" in platform && platform.firstRowSummary;
  let amount = 0;
  let matchedCount = matchedRows.length;
  if (firstRowSummary && !dateColumn) {
    amount = numberValue(rows[0]?.[amountColumn]);
    matchedCount = 1;
    if (!amount) { amount = rows.slice(1).reduce((sum, row) => sum + numberValue(row[amountColumn]), 0); matchedCount = Math.max(0, rows.length - 1); }
  } else amount = matchedRows.reduce((sum, row) => sum + numberValue(row[amountColumn]), 0);
  return { platform: platform.code, platformName: platform.name, dataMonth, amount: Math.round(amount * 100) / 100, currency: forceCurrency || detectCurrency(matchedRows, amountColumn, platform.defaultCurrency), rowCount: rows.length, matchedCount, amountColumnName: amountColumn, dateColumnName: dateColumn, processedAt: new Date().toISOString() };
}

export function parseProjectSourceSnapshot(value: string): ProjectSourceSnapshot | null {
  try { const parsed = JSON.parse(value) as ProjectSourceSnapshot; return parsed?.platform && parsed?.dataMonth ? parsed : null; }
  catch { return null; }
}
