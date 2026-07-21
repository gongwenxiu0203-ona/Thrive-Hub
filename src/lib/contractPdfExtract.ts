import { extractScannedPdfTextWithOcr } from "@/lib/contractOcr";

/** Extract only the PDF's embedded text layer. Never invokes OCR. */
export async function extractPdfEmbeddedText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  return String(parsed.text ?? "").trim();
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const text = await extractPdfEmbeddedText(buffer);
  if (text.length >= 120) return text;
  const ocrText = await extractScannedPdfTextWithOcr(buffer);
  return ocrText || text;
}
