import { promises as fs } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { invoiceDocumentHtml } from "./invoiceDocument";

export type InvoicePdfItem = {
  feeType: string;
  currency?: string;
  periodType?: string;
  periodLabel?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type InvoicePdfData = {
  invoiceNo: string;
  invoiceDate: Date;
  dueDate: Date;
  periodLabel: string;
  feeType: string;
  clientName: string;
  clientAddress?: string | null;
  currency: string;
  totalAmount: number;
  currencyTotals?: Array<{ currency: string; amount: number }>;
  bankSnapshot: {
    beneficiary?: string | null;
    bankName?: string | null;
    bankAddress?: string | null;
    swiftCode?: string | null;
    accountNo?: string | null;
  };
  terms?: string | null;
  items: InvoicePdfItem[];
};

function currencyTotals(
  invoice: InvoicePdfData,
): Array<{ currency: string; amount: number }> {
  if (invoice.currencyTotals?.length) return invoice.currencyTotals;
  const totals = new Map<string, number>();
  for (const item of invoice.items) {
    const currency = item.currency?.trim().toUpperCase() || invoice.currency;
    totals.set(currency, (totals.get(currency) ?? 0) + item.amount);
  }
  return Array.from(totals, ([currency, amount]) => ({ currency, amount }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

export function invoiceLogoBounds(width: number, height: number) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error("Invalid invoice logo dimensions");
  const scale = Math.min(64 / width, 64 / height);
  return { width: width * scale, height: height * scale };
}

let pdfQueue: Promise<unknown> = Promise.resolve();
let pendingRenders = 0;
export function generateInvoicePdf(invoice: InvoicePdfData): Promise<Uint8Array> {
  if (pendingRenders >= 5) return Promise.reject(new Error("Invoice PDF 导出繁忙，请稍后重试。"));
  pendingRenders++;
  const result = pdfQueue.then(() => renderInvoicePdf(invoice)).finally(() => { pendingRenders--; });
  pdfQueue = result.catch(() => undefined);
  return result;
}

async function renderInvoicePdf(
  invoice: InvoicePdfData,
): Promise<Uint8Array> {
  const dataUrl = async (file: string, type: string) => `data:${type};base64,${(await fs.readFile(path.join(process.cwd(), "public", file))).toString("base64")}`;
  const html = invoiceDocumentHtml({
    invoiceNo: invoice.invoiceNo, invoiceDate: invoice.invoiceDate.toISOString().slice(0,10), dueDate: invoice.dueDate.toISOString().slice(0,10),
    clientName: invoice.clientName, clientAddress: invoice.clientAddress, items: invoice.items.map(i=>({...i,currency:i.currency||invoice.currency})),
    currencyTotals: currencyTotals(invoice), terms: invoice.terms, bank: invoice.bankSnapshot,
  }, {
    logo: await dataUrl("thraive-logo.png", "image/png"),
    serifRegular: await dataUrl("fonts/Tinos-Regular.woff2", "font/woff2"), serifBold: await dataUrl("fonts/Tinos-Bold.woff2", "font/woff2"),
    sansRegular: await dataUrl("fonts/SourceHanSansCN-Regular.otf", "font/otf"), sansBold: await dataUrl("fonts/SourceHanSansCN-Bold.otf", "font/otf"),
  });
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined);
  const browser = await puppeteer.launch({ executablePath, headless: true, timeout: 60000, args: process.platform === "linux" ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] : [] }).catch((cause: unknown) => { throw new Error("PDF 渲染浏览器启动失败，请检查 Chromium 安装及 PUPPETEER_EXECUTABLE_PATH 配置。", { cause }); });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.emulateMediaType("screen");
    // All invoice values are escaped and all assets embedded; disallow remote fetching.
    await page.setRequestInterception(true);
    page.on("request", request => request.url().startsWith("data:") || request.url() === "about:blank" ? void request.continue() : void request.abort());
    await page.setContent(html, { waitUntil: "load", timeout: 60000 });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => image.decode())); });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, timeout: 60000 });
  } finally { await browser.close(); }
}

export function invoicePdfFilename(
  invoice: Pick<
    InvoicePdfData,
    "clientName" | "periodLabel" | "feeType" | "invoiceDate"
  >,
): string {
  const fee =
    invoice.feeType === "MONTHLY_FEE"
      ? "月费"
      : invoice.feeType === "SALES_COMMISSION"
        ? "销售佣金"
        : "混合费用";
  const date = invoice.invoiceDate.toISOString().slice(0, 10).replaceAll("-", "");
  const raw = `${invoice.clientName}_${invoice.periodLabel}_${fee}_${date}`;
  const safe = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim()
    .slice(0, 150);
  return `${safe || "invoice"}.pdf`;
}
