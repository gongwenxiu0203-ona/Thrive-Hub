// Best-effort plain-text extraction from an uploaded contract file.
// PDF via pdf-parse; .doc/.docx via mammoth; .txt/.md read directly.

import path from "path";

export async function extractFileText(file: File): Promise<string> {
  const ext = path.extname(file.name).toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === ".txt" || ext === ".md") {
    return buffer.toString("utf-8");
  }

  if (ext === ".pdf") {
    try {
      const mod = await import("pdf-parse");
      const pdfParse = (mod as { default?: unknown }).default ?? mod;
      const result = await (pdfParse as (b: Buffer) => Promise<{ text: string }>)(buffer);
      return result.text ?? "";
    } catch {
      return "";
    }
  }

  if (ext === ".docx" || ext === ".doc") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    } catch {
      return "";
    }
  }

  return "";
}
