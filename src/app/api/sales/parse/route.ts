import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseSheet } from "@/lib/excel";
import { suggestMapping } from "@/lib/salesImport";
import { randomUUID } from "crypto";
import { writeFile, readdir, unlink, stat } from "fs/promises";
import path from "path";
import os from "os";

// Step 1 of the BI import flow:
//   form fields: file, platform (联盟平台名)
// Returns: tempId + columns + sampleRows + auto-suggested mapping.
// Parsed rows are persisted to a temp file on the server so the upload step
// can reference them by ID — this avoids sending a potentially huge JSON body
// back from the browser in step 2.

const TEMP_PREFIX = "sales-parse-";
const TEMP_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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

  let rows;
  try {
    rows = parseSheet(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      {
        error:
          "无法解析该文件，请确认是有效的 Excel(.xlsx/.xls) 或 CSV 文件",
      },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "文件中没有数据行，首行应为列名" },
      { status: 400 },
    );
  }
  const columns = Object.keys(rows[0]);
  if (columns.length === 0) {
    return NextResponse.json(
      { error: "未能识别表头列，请确认首行为列名" },
      { status: 400 },
    );
  }

  // Persist parsed rows to a server-side temp file.
  // This prevents the browser from having to send all rows back in step 2,
  // which would create a huge request body and frequently hit proxy size limits.
  const tempId = randomUUID();
  const tempPath = path.join(os.tmpdir(), `${TEMP_PREFIX}${tempId}.json`);
  try {
    await writeFile(tempPath, JSON.stringify(rows), "utf-8");
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
    // Only send a small sample to the browser for the mapping preview.
    sampleRows: rows.slice(0, 5),
    rowCount: rows.length,
    suggestedMapping: suggestMapping(platform, columns),
  });
}
