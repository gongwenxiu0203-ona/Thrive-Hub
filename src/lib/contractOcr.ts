import { execFile } from "child_process";
import { existsSync } from "fs";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const OCR_DPI = Number(process.env.CONTRACT_OCR_DPI || 150);
const OCR_MAX_PAGES = Number(process.env.CONTRACT_OCR_MAX_PAGES || 25);
const OCR_RENDER_TIMEOUT_MS = Number(process.env.CONTRACT_OCR_RENDER_TIMEOUT_MS || 60_000);
const OCR_PAGE_TIMEOUT_MS = Number(process.env.CONTRACT_OCR_PAGE_TIMEOUT_MS || 45_000);

export async function extractScannedPdfTextWithOcr(buffer: Buffer): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "contract-ocr-"));
  const pdfPath = path.join(dir, "input.pdf");
  try {
    await fs.writeFile(pdfPath, buffer);
    const prefix = path.join(dir, "page");
    await runCommand(command("PDFTOPPM_CMD", "pdftoppm"), [
      "-r",
      String(OCR_DPI),
      "-png",
      "-f",
      "1",
      "-l",
      String(OCR_MAX_PAGES),
      pdfPath,
      prefix,
    ], OCR_RENDER_TIMEOUT_MS);

    const files = (await fs.readdir(dir))
      .filter((name) => name.startsWith("page-") && name.endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (files.length === 0) return "";

    const chunks: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const imagePath = path.join(dir, file);
      const outBase = imagePath.replace(/\.png$/i, "");
      const tessdataDir = resolveTessdataDir();
      console.info(`[contract-ocr] OCR ${index + 1}/${files.length}: ${file}`);
      await runCommand(command("TESSERACT_CMD", "tesseract"), [
        imagePath,
        outBase,
        ...(tessdataDir ? ["--tessdata-dir", tessdataDir] : []),
        "-l",
        resolveTesseractLang(tessdataDir),
        "--psm",
        "6",
      ], OCR_PAGE_TIMEOUT_MS);
      const textPath = `${outBase}.txt`;
      chunks.push(await fs.readFile(textPath, "utf8"));
    }
    return chunks.join("\n\n").trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `扫描版 PDF 需要安装 OCR 组件后才能识别：poppler-utils(pdftoppm) + tesseract-ocr(含中文语言包)。当前 OCR 调用失败：${message}`,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function resolveTessdataDir(): string | null {
  const configured = process.env.TESSDATA_DIR;
  if (configured && existsSync(path.join(configured, "chi_sim.traineddata"))) {
    return configured;
  }

  if (process.platform === "win32") {
    const localTessdata = path.join(
      process.env.LOCALAPPDATA || os.homedir(),
      "Tesseract-OCR",
      "tessdata",
    );
    if (existsSync(path.join(localTessdata, "chi_sim.traineddata"))) {
      return localTessdata;
    }
  }

  return null;
}

function resolveTesseractLang(tessdataDir: string | null): string {
  if (process.env.TESSERACT_LANG) return process.env.TESSERACT_LANG;
  if (tessdataDir && !existsSync(path.join(tessdataDir, "eng.traineddata"))) {
    return "chi_sim";
  }
  return "chi_sim+eng";
}

function command(envKey: string, fallback: string): string {
  if (process.env[envKey]) return process.env[envKey]!;

  if (process.platform === "win32") {
    if (fallback === "tesseract") {
      return "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";
    }
    if (fallback === "pdftoppm") {
      const wingetPoppler = path.join(
        process.env.LOCALAPPDATA || "",
        "Microsoft",
        "WinGet",
        "Packages",
        "oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe",
        "poppler-25.07.0",
        "Library",
        "bin",
        "pdftoppm.exe",
      );
      if (existsSync(wingetPoppler)) return wingetPoppler;

      return path.join(
        os.homedir(),
        ".cache",
        "codex-runtimes",
        "codex-primary-runtime",
        "dependencies",
        "bin",
        "pdftoppm.cmd",
      );
    }
  }

  return fallback;
}

function runCommand(commandPath: string, args: string[], timeout: number) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(commandPath)) {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", commandPath, ...args], { timeout });
  }
  return execFileAsync(commandPath, args, { timeout });
}
