import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_EXT = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".doc", ".docx", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".txt", ".zip",
]);

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export type SavedFile = {
  fileName: string;
  fileUrl: string;
  fileSize: number;
};

export async function saveUploadedFile(file: File): Promise<SavedFile> {
  if (file.size > MAX_SIZE) {
    throw new Error("文件超过 20MB 限制");
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`不支持的文件类型：${ext || "未知"}`);
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, safeName), buffer);

  return {
    fileName: file.name,
    fileUrl: `/uploads/${safeName}`,
    fileSize: file.size,
  };
}
