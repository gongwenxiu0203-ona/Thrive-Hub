import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSheetSample, type Row } from "@/lib/excel";
import { suggestMapping } from "@/lib/salesImport";
import { randomUUID } from "crypto";
import { writeFile, readdir, unlink, stat, open, readFile } from "fs/promises";
import path from "path";
import os from "os";
import { hasBiPermission } from "@/lib/biAuthorization";
import { errorResponse } from "@/lib/appError";

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
// Keep a small safety margin below the reverse proxy / Next.js 110 MB limit.
// The current production server can therefore accept the user's ~78 MB file,
// while oversized requests fail before consuming avoidable memory or disk.
const MAX_UPLOAD_BYTES = 105 * 1024 * 1024;

function decodeUploadHeader(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function streamRequestToTempFile(
  req: Request,
  tempPath: string,
): Promise<number> {
  if (!req.body) throw new Error("EMPTY_UPLOAD_BODY");

  const declaredSize = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_UPLOAD_BYTES) {
    throw new Error("UPLOAD_TOO_LARGE");
  }

  const handle = await open(tempPath, "wx");
  const reader = req.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_UPLOAD_BYTES) throw new Error("UPLOAD_TOO_LARGE");
      await handle.write(value);
    }
    if (received === 0) throw new Error("EMPTY_UPLOAD_BODY");
    return received;
  } finally {
    reader.releaseLock();
    await handle.close();
  }
}

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
  if (!(await hasBiPermission(session.userId, "bi.import", "EDIT"))) {
    return NextResponse.json({ error: "无权解析或导入 BI 数据" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";
  const isRawUpload = contentType.startsWith("application/octet-stream");
  const tempId = randomUUID();
  const tempPath = path.join(os.tmpdir(), `${TEMP_PREFIX}${tempId}${TEMP_EXT}`);

  let fileName = "";
  let platform = "";
  let rawBuffer: ArrayBuffer;

  if (isRawUpload) {
    fileName = decodeUploadHeader(req.headers.get("x-file-name")).trim();
    platform = decodeUploadHeader(req.headers.get("x-platform")).trim();
    if (!fileName) {
      return NextResponse.json({ error: "缺少上传文件名" }, { status: 400 });
    }
    try {
      // Raw-body uploads are written chunk-by-chunk. Unlike req.formData(),
      // this does not retain another complete ~80 MB copy while receiving it.
      await streamRequestToTempFile(req, tempPath);
      const saved = await readFile(tempPath);
      rawBuffer = saved.buffer.slice(
        saved.byteOffset,
        saved.byteOffset + saved.byteLength,
      ) as ArrayBuffer;
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      if (error instanceof Error && error.message === "UPLOAD_TOO_LARGE") {
        return NextResponse.json(
          { error: "文件超过 105 MB，请拆分文件后再上传" },
          { status: 413 },
        );
      }
      return NextResponse.json({ error: "文件上传失败，请重试" }, { status: 400 });
    }
  } else {
    // Backwards-compatible multipart path for older clients.
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "请求格式错误，请重试" }, { status: 400 });
    }

    const file = form.get("file");
    platform = String(form.get("platform") ?? "").trim();
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "请选择要上传的销售数据文件" },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "文件超过 105 MB，请拆分文件后再上传" },
        { status: 413 },
      );
    }
    fileName = file.name;
    rawBuffer = await file.arrayBuffer();
  }

  // Parse ONLY the header + 5 sample rows for the column mapping UI.
  // Using sheetRows:6 means the xlsx library skips the remaining rows entirely,
  // avoiding the CPU-blocking synchronous parse that caused the "解析中..." hang.
  let sample: { columns: string[]; sampleRows: Row[]; totalRows: number };
  try {
    sample = parseSheetSample(rawBuffer, 5, fileName);
  } catch {
    await unlink(tempPath).catch(() => {});
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
    await unlink(tempPath).catch(() => {});
    return NextResponse.json(
      { error: "文件中没有数据行或未能识别表头，请确认首行为列名" },
      { status: 400 },
    );
  }

  // Persist the raw file buffer to a server-side temp file.
  // Step 2 (upload) reads this buffer and performs the full parse there.
  // Storing raw bytes (not parsed JSON) means Step 1 is always O(sample_rows)
  // regardless of how many rows the file contains.
  if (!isRawUpload) {
    try {
      await writeFile(tempPath, Buffer.from(rawBuffer));
    } catch (e) {
      return errorResponse(e, "sales.parse.temp-file");
    }
  }

  // Fire-and-forget cleanup of stale temp files.
  cleanupOldTempFiles();

  return NextResponse.json({
    tempId,
    fileName,
    columns,
    sampleRows,
    rowCount: totalRows,
    suggestedMapping: suggestMapping(platform, columns),
  });
}
