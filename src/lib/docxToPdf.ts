// docx → PDF via LibreOffice headless. Assumes `soffice` (or `libreoffice`)
// is on PATH on the deployment server.
// Usage: await convertDocxToPdf(docxAbsPath, outDir) → returns the .pdf path.

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

function pickSofficeBinary(): string {
  // Allow override
  if (process.env.SOFFICE_PATH) return process.env.SOFFICE_PATH;
  // Sensible defaults per platform
  if (process.platform === "win32") {
    return "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
  }
  // Linux/macOS — assume "soffice" on PATH (apt: libreoffice / macOS: /Applications/LibreOffice.app)
  return "soffice";
}

function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (e) => resolve({ stdout, stderr: stderr + e.message, code: -1 }));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

/**
 * Convert a .docx file to a .pdf file. Writes the .pdf next to the source by
 * default; use `outDir` to redirect. Returns the produced .pdf path.
 *
 * Throws with a human-friendly Chinese error message if soffice fails.
 */
export async function convertDocxToPdf(
  docxAbsPath: string,
  outDir?: string
): Promise<string> {
  const soffice = pickSofficeBinary();
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "thraive-pdf-"));
  try {
    const outDirEff = outDir ?? path.dirname(docxAbsPath);
    await fs.mkdir(outDirEff, { recursive: true });

    // LibreOffice headless: --convert-to pdf -- outdir then path
    const args = [
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--nologo",
      "--convert-to",
      "pdf",
      "--outdir",
      tmpRoot,
      docxAbsPath,
    ];
    const r = await run(soffice, args);
    if (r.code !== 0) {
      throw new Error(
        `LibreOffice 转换失败 (exit ${r.code})。请确认服务器已安装 LibreOffice，且 SOFFICE_PATH 环境变量正确。\nstderr: ${r.stderr.slice(0, 500)}`
      );
    }
    // Find produced pdf in tmpRoot
    const files = await fs.readdir(tmpRoot);
    const pdfName = files.find((f) => f.toLowerCase().endsWith(".pdf"));
    if (!pdfName) throw new Error("LibreOffice 未产生 PDF 文件");
    const src = path.join(tmpRoot, pdfName);
    const baseNoExt = path.basename(docxAbsPath).replace(/\.docx$/i, "");
    const dest = path.join(outDirEff, `${baseNoExt}.pdf`);
    await fs.copyFile(src, dest);
    return dest;
  } finally {
    // Best-effort cleanup
    try { await fs.rm(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}
