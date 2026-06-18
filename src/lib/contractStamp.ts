// Stamp a PDF: overlay the seal PNG on every page at a fixed corner.
// Pure pdf-lib — no external CLI.
//
// Layout: bottom-right by default. Each page gets a single seal image at a
// stable size relative to the page. The seal is intentionally rendered with
// slight transparency so it reads as a stamp rather than a paste-over.

import { promises as fs } from "fs";
import { PDFDocument, degrees } from "pdf-lib";

export interface StampOptions {
  /** Seal width in PDF points (1pt ≈ 1/72 inch). Default ~85pt ≈ 30 mm. */
  widthPt?: number;
  /** Inset from the page corner in points. Default 36pt = 0.5 inch. */
  insetPt?: number;
  /** 0..1 opacity. Default 0.85. */
  opacity?: number;
  /** Slight rotation for visual realism (degrees). Default 0 (straight). */
  rotateDegrees?: number;
  /** Corner: "br" | "bl" | "tr" | "tl". Default "br". */
  corner?: "br" | "bl" | "tr" | "tl";
}

/**
 * Apply the seal image to every page of `pdfBytes` and return the resulting
 * PDF as a Buffer. Throws if the seal PNG cannot be loaded.
 */
export async function stampPdf(
  pdfBytes: Buffer,
  sealPngBytes: Buffer,
  opts: StampOptions = {}
): Promise<Buffer> {
  const widthPt = opts.widthPt ?? 85;
  const inset = opts.insetPt ?? 36;
  const opacity = opts.opacity ?? 0.85;
  const rot = opts.rotateDegrees ?? 0;
  const corner = opts.corner ?? "br";

  const pdf = await PDFDocument.load(pdfBytes);
  const seal = await pdf.embedPng(sealPngBytes);
  // Preserve seal aspect ratio
  const sealAspect = seal.height / seal.width;
  const heightPt = widthPt * sealAspect;

  const pages = pdf.getPages();
  for (const page of pages) {
    const { width: pw, height: ph } = page.getSize();
    let x = inset;
    let y = inset;
    if (corner === "br") { x = pw - widthPt - inset; y = inset; }
    else if (corner === "bl") { x = inset; y = inset; }
    else if (corner === "tr") { x = pw - widthPt - inset; y = ph - heightPt - inset; }
    else if (corner === "tl") { x = inset; y = ph - heightPt - inset; }

    page.drawImage(seal, {
      x,
      y,
      width: widthPt,
      height: heightPt,
      opacity,
      rotate: degrees(rot),
    });
  }

  const out = await pdf.save();
  return Buffer.from(out);
}

/** Convenience: stamp from file paths. */
export async function stampPdfFromPaths(
  pdfAbsPath: string,
  sealPngAbsPath: string,
  outAbsPath: string,
  opts: StampOptions = {}
): Promise<void> {
  const pdfBytes = await fs.readFile(pdfAbsPath);
  const sealBytes = await fs.readFile(sealPngAbsPath);
  const out = await stampPdf(pdfBytes, sealBytes, opts);
  await fs.writeFile(outAbsPath, out);
}
