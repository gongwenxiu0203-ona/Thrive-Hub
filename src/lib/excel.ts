import * as XLSX from "xlsx";

export type Row = Record<string, string | number | boolean | null>;

/**
 * Detect if a raw 2D array represents a vertical intake-form layout:
 *   Column A = field label, Column B = value (one customer, N rows).
 * Distinguishes from a horizontal table (first row = headers, rest = data rows).
 */
function isVerticalForm(raw: unknown[][]): boolean {
  // Need at least 4 label-value pairs to be a form
  const dataRows = raw.filter((r) => r[0] != null && String(r[0]).trim() !== "");
  if (dataRows.length < 4) return false;

  // Count how many effective columns each row uses (non-empty cells)
  const colCounts = raw.map(
    (r) => r.filter((c) => c != null && String(c).trim() !== "").length,
  );
  const maxCols = Math.max(...colCounts);

  // A vertical form has at most 3 columns; a horizontal table has many more
  if (maxCols > 3) return false;

  // Column A values should all be unique (each row is a different field)
  const labels = dataRows.map((r) => String(r[0]).trim());
  const unique = new Set(labels);
  return unique.size === labels.length;
}

/**
 * Transpose a vertical form into a single Row object.
 * Multi-line cell labels (e.g. "社媒推广情况\n（详情）") are collapsed to
 * the first line so alias matching works.
 */
function transposeVertical(raw: unknown[][]): Row {
  const row: Row = {};
  for (const r of raw) {
    if (!r[0]) continue;
    // Keep only the first line of the label (strips parenthetical descriptions)
    const key = String(r[0]).split("\n")[0].trim();
    const rawVal = r[1];
    row[key] =
      rawVal == null || String(rawVal).trim() === ""
        ? null
        : String(rawVal).trim();
  }
  return row;
}

/** Parse the first sheet of an xlsx/csv buffer into row objects keyed by header.
 *  Supports both:
 *    - Horizontal table format: row 1 = headers, rows 2+ = one customer each
 *    - Vertical form format: col A = field label, col B = value (single customer)
 */
export function parseSheet(buffer: ArrayBuffer): Row[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];

  // Read raw 2-D array first for format detection
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });

  if (isVerticalForm(raw)) {
    // Single-customer vertical intake form → produce exactly one Row
    return [transposeVertical(raw)];
  }

  // Standard horizontal table
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
}

/**
 * Fast partial parse: reads ONLY the header row + up to maxSampleRows data rows.
 * Uses XLSX's sheetRows option so the library skips all remaining rows —
 * critical for large files (10k+ rows) to avoid blocking the Node.js event loop.
 *
 * The sheet's <dimension> element is read before row data, so sheet["!ref"]
 * still reflects the full sheet dimensions even with sheetRows applied.
 * This lets us return an accurate totalRows count without parsing everything.
 *
 * Used in Step 1 (parse) of the BI import flow for column detection and
 * mapping suggestions. The raw file buffer must be saved to temp so that
 * Step 2 (upload) can call parseSheet() for the full data.
 */
export function parseSheetSample(
  buffer: ArrayBuffer,
  maxSampleRows = 5,
): { columns: string[]; sampleRows: Row[]; totalRows: number } {
  const wb = XLSX.read(buffer, {
    type: "array",
    sheetRows: maxSampleRows + 1, // +1 to include the header row
  });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { columns: [], sampleRows: [], totalRows: 0 };
  const sheet = wb.Sheets[sheetName];

  // !ref is populated from the XML <dimension> element which the parser reads
  // before row data — it is NOT affected by the sheetRows limit.
  let totalRows = 0;
  if (sheet["!ref"]) {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    // range.e.r is the 0-based last row index; row 0 is the header row, so
    // data row count = range.e.r (equals the 1-based last data row number).
    totalRows = Math.max(0, range.e.r);
  }

  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
  if (rows.length === 0) return { columns: [], sampleRows: [], totalRows };

  const columns = Object.keys(rows[0]);
  // Fall back to sample length when !ref was unavailable.
  if (totalRows === 0) totalRows = rows.length;
  return { columns, sampleRows: rows.slice(0, maxSampleRows), totalRows };
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
