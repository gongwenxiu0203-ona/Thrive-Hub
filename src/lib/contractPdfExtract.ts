import { extractScannedPdfTextWithOcr } from "@/lib/contractOcr";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  const text = String(parsed.text ?? "").trim();
  if (text.length >= 120) return text;
  const ocrText = await extractScannedPdfTextWithOcr(buffer);
  return ocrText || text;
}
