import * as XLSX from "xlsx";

export type Row = Record<string, string | number | boolean | null>;

/** Parse the first sheet of an xlsx/csv buffer into row objects keyed by header. */
export function parseSheet(buffer: ArrayBuffer): Row[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
}

/** Build an xlsx file buffer from row objects. */
export function buildSheet(rows: Row[], sheetName = "Sheet1"): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Pick the first non-empty value among several candidate header names. */
export function pick(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

export function pickNumber(row: Row, ...keys: string[]): number {
  const raw = pick(row, ...keys).replace(/[$,%\s]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
