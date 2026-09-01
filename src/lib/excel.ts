import * as XLSX from "xlsx";

export type Row = Record<string, string | number | boolean | null>;
export type SheetInput = ArrayBuffer | Uint8Array;

function asBytes(buffer: SheetInput): Uint8Array {
  return buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
}

function isBinaryWorkbook(buffer: SheetInput): boolean {
  const bytes = asBytes(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf
    && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return isZip || isOle;
}

function decodeDelimitedText(buffer: SheetInput): string {
  const bytes = asBytes(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    // Most platform exports are UTF-8 without a BOM. Fatal decoding lets us
    // distinguish them from legacy Chinese ANSI/GBK exports.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

function readWorkbook(
  buffer: SheetInput,
  options: { sheetRows?: number } = {},
) {
  return isBinaryWorkbook(buffer)
    ? XLSX.read(buffer, { type: "array", ...options })
    : XLSX.read(decodeDelimitedText(buffer), { type: "string", ...options });
}

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
export function parseSheet(buffer: SheetInput): Row[] {
  return Array.from(parseSheetChunks(buffer)).flat();
}

/**
 * Parse the first worksheet in bounded row chunks.
 *
 * `XLSX.read` still has to inflate an xlsx workbook, but this avoids creating
 * one additional object for every worksheet row at the same time. Large BI
 * imports can consume each yielded chunk and release it before reading the
 * next one instead of retaining a second full-file `Row[]` allocation.
 */
export function* parseSheetChunks(
  buffer: SheetInput,
  chunkSize = 1_000,
): Generator<Row[], void, void> {
  const wb = readWorkbook(buffer);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return;
  const sheet = wb.Sheets[sheetName];
  const ref = sheet["!ref"];
  if (!ref) return;
  const fullRange = XLSX.utils.decode_range(ref);

  // Only inspect a small prefix for layout detection. The previous
  // implementation materialized the entire worksheet as a 2-D array and then
  // materialized it again as objects, which roughly doubled peak row memory.
  const detectionRange = XLSX.utils.encode_range({
    s: fullRange.s,
    e: { c: fullRange.e.c, r: Math.min(fullRange.e.r, fullRange.s.r + 9) },
  });
  const sample = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    range: detectionRange,
  });

  if (isVerticalForm(sample)) {
    // Single-customer vertical intake form → produce exactly one Row
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    });
    yield [transposeVertical(raw)];
    return;
  }

  if (fullRange.e.r <= fullRange.s.r) return;

  // Ask SheetJS to generate its canonical header names (including duplicate
  // and blank-header suffixes) from just the header and first data row. This
  // keeps field mappings identical to parseSheetSample().
  const headerProbeRange = XLSX.utils.encode_range({
    s: fullRange.s,
    e: { c: fullRange.e.c, r: Math.min(fullRange.e.r, fullRange.s.r + 1) },
  });
  const headerProbe = XLSX.utils.sheet_to_json<Row>(sheet, {
    defval: "",
    raw: false,
    range: headerProbeRange,
  });
  const headers = Object.keys(headerProbe[0] ?? {});
  if (headers.length === 0) return;

  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  for (
    let startRow = fullRange.s.r + 1;
    startRow <= fullRange.e.r;
    startRow += safeChunkSize
  ) {
    const endRow = Math.min(fullRange.e.r, startRow + safeChunkSize - 1);
    const range = XLSX.utils.encode_range({
      s: { c: fullRange.s.c, r: startRow },
      e: { c: fullRange.e.c, r: endRow },
    });
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      header: headers,
      defval: "",
      raw: false,
      range,
    });
    if (rows.length > 0) yield rows;
  }
}

/**
 * Fast partial parse: reads ONLY the header row + up to maxSampleRows data rows.
 * Uses XLSX's sheetRows option so the library skips all remaining rows —
 * critical for large files (10k+ rows) to avoid blocking the Node.js event loop.
 *
 * The xlsx library clips sheet["!ref"] to the parsed rows when sheetRows is
 * set, but preserves the original range in sheet["!fullref"]. We use !fullref
 * to return an accurate totalRows count without parsing all rows.
 *
 * Used in Step 1 (parse) of the BI import flow for column detection and
 * mapping suggestions. The raw file buffer must be saved to temp so that
 * Step 2 (upload) can call parseSheet() for the full data.
 */
export function parseSheetSample(
  buffer: SheetInput,
  maxSampleRows = 5,
  fileName = "",
): { columns: string[]; sampleRows: Row[]; totalRows: number } {
  const wb = readWorkbook(buffer, {
    sheetRows: maxSampleRows + 1, // +1 to include the header row
  });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { columns: [], sampleRows: [], totalRows: 0 };
  const sheet = wb.Sheets[sheetName];

  // When sheetRows is active, xlsx clips !ref to the parsed rows only.
  // !fullref preserves the original sheet range (from the XML <dimension>
  // element) regardless of the sheetRows limit — use it for the accurate count.
  const fullRef =
    (sheet["!fullref"] as string | undefined) ?? sheet["!ref"] ?? "";
  let totalRows = 0;
  if (fullRef) {
    const range = XLSX.utils.decode_range(fullRef);
    // range.e.r is 0-based last row index; row 0 is header, so data rows = range.e.r
    totalRows = Math.max(0, range.e.r);
  }

  // Unlike XLSX worksheets, CSV input parsed with `sheetRows` has no
  // `!fullref`: `!ref` only describes the header plus the five sampled rows.
  // Count logical CSV records directly, respecting quoted embedded newlines,
  // so the mapping screen can show the real import size without fully parsing
  // thousands of rows into objects.
  if (/\.(csv|tsv|txt)$/i.test(fileName)) {
    totalRows = countDelimitedDataRows(buffer);
  }

  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
  if (rows.length === 0) return { columns: [], sampleRows: [], totalRows };

  const columns = Object.keys(rows[0]);
  // Fall back to sample length when !ref was unavailable.
  if (totalRows === 0) totalRows = rows.length;
  return { columns, sampleRows: rows.slice(0, maxSampleRows), totalRows };
}

function countDelimitedDataRows(buffer: SheetInput): number {
  const bytes = asBytes(buffer);
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder("utf-16le").decode(bytes);
  } else {
    text = new TextDecoder("utf-8").decode(bytes);
  }

  let inQuotes = false;
  let recordHasContent = false;
  let logicalRecords = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      recordHasContent = true;
      continue;
    }

    if (!inQuotes && (char === "\r" || char === "\n")) {
      if (recordHasContent) logicalRecords += 1;
      recordHasContent = false;
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      continue;
    }

    if (!/\s/.test(char)) recordHasContent = true;
  }

  if (recordHasContent) logicalRecords += 1;
  return Math.max(0, logicalRecords - 1); // exclude header record
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
