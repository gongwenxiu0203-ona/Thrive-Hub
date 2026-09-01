import ExcelJS from "exceljs";
import * as unzipper from "unzipper";
import { readFile } from "node:fs/promises";
import { parseSheetChunks, parseSheetSample, type Row } from "@/lib/excel";

function isXlsx(fileName: string) {
  return /\.xlsx$/i.test(fileName);
}

function cellValue(value: ExcelJS.CellValue): Row[string] {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if ("richText" in value) return value.richText.map((item) => item.text).join("");
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
  if ("error" in value) return String(value.error);
  return String(value);
}

function buildHeaders(row: ExcelJS.Row): string[] {
  const headers: string[] = [];
  const counts = new Map<string, number>();
  for (let column = 1; column <= row.cellCount; column += 1) {
    const raw = String(cellValue(row.getCell(column).value) ?? "").trim();
    const base = raw || "__EMPTY";
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    headers.push(seen === 0 ? base : `${base}_${seen}`);
  }
  return headers;
}

function rowObject(row: ExcelJS.Row, headers: string[]): Row {
  const result: Row = {};
  for (let column = 1; column <= headers.length; column += 1) {
    result[headers[column - 1]] = cellValue(row.getCell(column).value);
  }
  return result;
}

async function xlsxDimensionRows(filePath: string): Promise<number> {
  const directory = await unzipper.Open.file(filePath);
  const entry = directory.files.find((item) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(item.path));
  if (!entry) return 0;
  let prefix = "";
  for await (const chunk of entry.stream()) {
    prefix += Buffer.from(chunk).toString("utf8");
    const match = prefix.match(/<dimension\s+[^>]*ref="[A-Z]+\d+:?[A-Z]*(\d+)"/i);
    if (match) return Math.max(0, Number(match[1]) - 1);
    if (prefix.length >= 64 * 1024 || prefix.includes("<sheetData")) return 0;
  }
  return 0;
}

async function hasSharedStrings(filePath: string) {
  const directory = await unzipper.Open.file(filePath);
  const entry = directory.files.find((item) => item.path.toLowerCase() === "xl/sharedstrings.xml");
  // Some exporters create an empty sharedStrings part while every cell uses
  // inline strings. Do not cache that part for a 500k+ row worksheet.
  return Boolean(entry && entry.uncompressedSize > 256);
}

function workbookReader(filePath: string, cacheSharedStrings: boolean) {
  return new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit",
    sharedStrings: cacheSharedStrings ? "cache" : "ignore",
    hyperlinks: "ignore",
    styles: "cache",
    worksheets: "emit",
  });
}

export async function parseSheetSampleFromFile(
  filePath: string,
  fileName: string,
  maxSampleRows = 5,
): Promise<{ columns: string[]; sampleRows: Row[]; totalRows: number }> {
  if (!isXlsx(fileName)) {
    const file = await readFile(filePath);
    return parseSheetSample(file, maxSampleRows, fileName);
  }

  const totalRowsPromise = xlsxDimensionRows(filePath).catch(() => 0);
  const reader = workbookReader(filePath, await hasSharedStrings(filePath));
  for await (const worksheet of reader) {
    let headers: string[] = [];
    const sampleRows: Row[] = [];
    for await (const row of worksheet) {
      if (headers.length === 0) {
        headers = buildHeaders(row);
        continue;
      }
      sampleRows.push(rowObject(row, headers));
      if (sampleRows.length >= maxSampleRows) break;
    }
    return { columns: headers, sampleRows, totalRows: await totalRowsPromise };
  }
  return { columns: [], sampleRows: [], totalRows: 0 };
}

export async function* parseSheetChunksFromFile(
  filePath: string,
  fileName: string,
  chunkSize = 1_000,
): AsyncGenerator<Row[], void, void> {
  if (!isXlsx(fileName)) {
    const file = await readFile(filePath);
    yield* parseSheetChunks(file, chunkSize);
    return;
  }

  const reader = workbookReader(filePath, await hasSharedStrings(filePath));
  for await (const worksheet of reader) {
    let headers: string[] = [];
    let chunk: Row[] = [];
    for await (const row of worksheet) {
      if (headers.length === 0) {
        headers = buildHeaders(row);
        continue;
      }
      chunk.push(rowObject(row, headers));
      if (chunk.length >= chunkSize) {
        yield chunk;
        chunk = [];
      }
    }
    if (chunk.length) yield chunk;
    return;
  }
}
