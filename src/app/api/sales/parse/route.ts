import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSheetSample, type Row } from "@/lib/excel";
import { suggestMapping } from "@/lib/salesImport";
import { randomUUID } from "crypto";
import { writeFile, readdir, unlink, stat } from "fs/promises";
import path from "path";
import os from "os";
import { hasBiPermission } from "@/lib/biAuthorization";

// Allow up to 5 minutes for large file parsing
export const maxDuration = 300;

// Step 1 of the BI import flow:
//   form fields: file, platform (联盟平台名)
// Returns: tempId + columns + sampleRows (first 5 rows) + suggestedMapping.
//
// PERFORMANCE: only the header + 5 sample rows are parsed here (parseSheetSample).
// The raw binary file is saved to a temp file so Step 2 (upload) can do the
// full parse there. This avoids blocking the Node.js event loop for large files
// and keeps the "解析中…" phase near-instant regardless of row count.

const TEMP_PREFIX = "sales-parse-";
const TEMP_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
// Temp files now store the raw binary file buffer (not parsed JSON) so that
// Step 2 (upload) can do the full parse there, keeping Step 1 fast.
const TEMP_EXT = ".bin";

/** Background cleanup of stale temp files older than TTL. */
async function cleanupOldTempFiles() {
  try {
    const tmpDir = os.tmpdir();
    const files = await readdir(tmpDir);
    const now = Date.now();
    for (const file of files) {
      if (!file.startsWith(TEMP_PREFIX)) continue;
      const filePath = path.join(tmpDir, file);
      try {
        const s = await stat(filePath);
        if (now - s.mtimeMs > TEMP_TTL_MS) await unlink(filePath);
      } catch {
        /* skip individual file errors */
      }
    }
  } catch {
    /* skip if tmpdir not readable */
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await hasBiPermission(session.userId, "EDIT"))) {
    return NextResponse.json({ error: "无权解析或导入 BI 数据" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误，请重试" }, { status: 400 });
  }

  const file = form.get("file");
  const platform = String(form.get("platform") ?? "").trim();
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "请选择要上传的销售数据文件" },
      { status: 400 },
    );
  }

  // Read the raw file buffer once — we save it as-is and parse it in full
  // only during Step 2 (upload). This keeps Step 1 fast even for huge files.
  const rawBuffer = await file.arrayBuffer();

  // Parse ONLY the header + 5 sample rows for the column mapping UI.
  // Using sheetRows:6 means the xlsx library skips the remaining rows entirely,
  // avoiding the CPU-blocking synchronous parse that caused the "解析中..." hang.
  let sample: { columns: string[]; sampleRows: Row[]; totalRows: number };
  try {
    sample = parseSheetSample(rawBuffer, 5, file.name);
  } catch {
    return NextResponse.json(
      {
        error:
          "无法解析该文件，请确认是有效的 Excel(.xlsx/.xls) 或 CSV 文件",
      },
      { status: 400 },
    );
  }

  const { columns, sampleRows, totalRows } = sample;

  if (columns.length === 0) {
    return NextResponse.json(
      { error: "文件中没有数据行或未能识别表头，请确认首行为列名" },
      { status: 400 },
    );
  }

  // Persist the raw file buffer to a server-side temp file.
  // Step 2 (upload) reads this buffer and performs the full parse there.
  // Storing raw bytes (not parsed JSON) means Step 1 is always O(sample_rows)
  // regardless of how many rows the file contains.
  const tempId = randomUUID();
  const tempPath = path.join(os.tmpdir(), `${TEMP_PREFIX}${tempId}${TEMP_EXT}`);
  try {
    await writeFile(tempPath, Buffer.from(rawBuffer));
  } catch (e) {
    console.error("[sales/parse] failed to write temp file:", e);
    return NextResponse.json(
      { error: "服务器临时存储失败，请重试" },
      { status: 500 },
    );
  }

  // Fire-and-forget cleanup of stale temp files.
  cleanupOldTempFiles();

  return NextResponse.json({
    tempId,
    fileName: file.name,
    columns,
    sampleRows,
    rowCount: totalRows,
    suggestedMapping: suggestMapping(platform, columns),
  });
}
