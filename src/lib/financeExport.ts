import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_INPUT_BYTES = 50 * 1024 * 1024;

export function csv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "\uFEFF";
  const keys = Object.keys(rows[0]);
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
  return `\uFEFF${keys.map(cell).join(",")}\r\n${rows.map((row) => keys.map((key) => cell(row[key])).join(",")).join("\r\n")}`;
}

function safeUploadPath(fileUrl: string) {
  let pathname: string;
  try { pathname = new URL(fileUrl, "http://local").pathname; } catch { return null; }
  if (!pathname.startsWith("/uploads/")) return null;
  const encoded = pathname.slice("/uploads/".length);
  let name: string;
  try { name = decodeURIComponent(encoded); } catch { return null; }
  if (!name || name !== path.basename(name) || name.includes("..") || /[\\/]/.test(name)) return null;
  const root = path.resolve(process.cwd(), "uploads");
  const resolved = path.resolve(root, name);
  return path.dirname(resolved) === root ? { resolved, name } : null;
}

export async function createFinanceExportZip(rows: Array<Record<string, unknown>>, attachmentUrls: string[]) {
  const zip = new JSZip();
  zip.file("records.csv", csv(rows));
  const skipped: Array<{ url: string; reason: string }> = [];
  let total = 0;
  let index = 0;
  for (const fileUrl of [...new Set(attachmentUrls)].slice(0, 200)) {
    const safe = safeUploadPath(fileUrl);
    if (!safe) { skipped.push({ url: fileUrl, reason: "仅导出 /uploads/ 下的本地附件；远程或非法路径已跳过" }); continue; }
    try {
      const stat = await fs.stat(safe.resolved);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES || total + stat.size > MAX_ZIP_INPUT_BYTES) { skipped.push({ url: fileUrl, reason: "附件不存在、超过20MB或ZIP附件总量超过50MB" }); continue; }
      const data = await fs.readFile(safe.resolved);
      total += data.length;
      zip.file(`attachments/${String(++index).padStart(3, "0")}-${safe.name.replace(/[^\w.\-\u4e00-\u9fff]/g, "_")}`, data);
    } catch { skipped.push({ url: fileUrl, reason: "附件不可读取" }); }
  }
  if (skipped.length) zip.file("attachments-skipped.csv", csv(skipped));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function parseUrlJson(value: string | null | undefined): string[] {
  if (!value) return [];
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}
