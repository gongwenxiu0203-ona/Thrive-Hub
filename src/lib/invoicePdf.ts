import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  type Image,
} from "@napi-rs/canvas";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 72;
const TABLE_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const FONT_FAMILY = "ThraiveSourceHanSansCN";
const FONT_PATH = path.join(
  process.cwd(),
  "public",
  "fonts",
  "SourceHanSansCN-Regular.otf",
);
const FONT_BOLD_PATH = path.join(
  process.cwd(),
  "public",
  "fonts",
  "SourceHanSansCN-Bold.otf",
);
const LOGO_PATH = path.join(process.cwd(), "public", "thraive-logo.png");

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

type RenderedItem = InvoicePdfItem & {
  currency: string;
  periodType: string;
  periodLabel: string;
  lines: string[];
  height: number;
};

type InvoicePage = {
  items: RenderedItem[];
  first: boolean;
  summary: boolean;
};

let fontReady: Promise<void> | null = null;
function ensureFont(): Promise<void> {
  if (!fontReady) {
    fontReady = Promise.resolve().then(() => {
      GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
      GlobalFonts.registerFromPath(FONT_BOLD_PATH, FONT_FAMILY);
    });
  }
  return fontReady;
}

let logoPromise: Promise<Image> | null = null;
function logoImage(): Promise<Image> {
  logoPromise ??= loadImage(LOGO_PATH);
  return logoPromise;
}

function estimateCharacterWidth(character: string, fontSize: number): number {
  if (/\s/.test(character)) return fontSize * 0.32;
  if (/[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/u.test(character)) {
    return fontSize;
  }
  if (/[MW@#%&]/.test(character)) return fontSize * 0.8;
  if (/[ilI1.,:;|']/u.test(character)) return fontSize * 0.3;
  return fontSize * 0.56;
}

function wrapText(value: unknown, maxWidth: number, fontSize: number): string[] {
  const source = String(value ?? "").replace(/\r\n?/g, "\n");
  const result: string[] = [];

  for (const paragraph of source.split("\n")) {
    if (!paragraph) {
      result.push("");
      continue;
    }
    let line = "";
    let width = 0;
    for (const character of Array.from(paragraph)) {
      const characterWidth = estimateCharacterWidth(character, fontSize);
      if (line && width + characterWidth > maxWidth) {
        result.push(line.trimEnd());
        line = character.trimStart();
        width = line ? characterWidth : 0;
      } else {
        line += character;
        width += characterWidth;
      }
    }
    if (line || result.length === 0) result.push(line.trimEnd());
  }
  return result.length ? result : [""];
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMoney(value: number, currency: string): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${Number(value || 0).toFixed(2)}`;
  }
}

function normalizeItems(items: InvoicePdfItem[]): RenderedItem[] {
  return items.map((item) => {
    const lines = wrapText(item.description, 590, 23);
    return {
      ...item,
      currency: item.currency?.trim().toUpperCase() || "USD",
      periodType: item.periodType || "MONTH",
      periodLabel: item.periodLabel?.trim() || "-",
      lines,
      height: Math.max(74, 32 + lines.length * 31),
    };
  });
}

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

function paginate(items: RenderedItem[]): InvoicePage[] {
  const pages: InvoicePage[] = [];
  let index = 0;
  let first = true;

  while (index < items.length) {
    const startY = first ? 560 : 280;
    const bottom = 1320;
    const pageItems: RenderedItem[] = [];
    let used = startY;
    while (index < items.length) {
      const item = items[index];
      if (pageItems.length && used + item.height > bottom) break;
      if (!pageItems.length && item.height > bottom - startY) {
        const maxLines = Math.max(1, Math.floor((bottom - startY - 28) / 31));
        const headLines = item.lines.slice(0, maxLines);
        const tailLines = item.lines.slice(maxLines);
        pageItems.push({
          ...item,
          lines: headLines,
          height: Math.max(74, 32 + headLines.length * 31),
          quantity: tailLines.length ? 0 : item.quantity,
          unitPrice: tailLines.length ? 0 : item.unitPrice,
          amount: tailLines.length ? 0 : item.amount,
        });
        if (tailLines.length) {
          items[index] = {
            ...item,
            description: tailLines.join(""),
            lines: tailLines,
            height: Math.max(74, 32 + tailLines.length * 31),
          };
        } else {
          index += 1;
        }
        break;
      }
      pageItems.push(item);
      used += item.height;
      index += 1;
    }
    pages.push({ items: pageItems, first, summary: false });
    first = false;
  }

  if (pages.length === 0) {
    pages.push({ items: [], first: true, summary: true });
    return pages;
  }

  const last = pages.at(-1)!;
  const lastStartY = last.first ? 560 : 280;
  const itemHeight = last.items.reduce((sum, item) => sum + item.height, 0);
  if (lastStartY + itemHeight <= 1030) {
    last.summary = true;
  } else {
    pages.push({ items: [], first: false, summary: true });
  }
  return pages;
}

/* ----------------------------- canvas drawing ----------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any;

function cnFont(size: number, weight = 400): string {
  return `${weight} ${size}px "${FONT_FAMILY}", sans-serif`;
}

function serifFont(size: number, weight = 400): string {
  return `${weight} ${size}px Georgia, "Times New Roman", serif`;
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  font: string,
  fill: string,
  align: "left" | "center" | "right" = "left",
): void {
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

function lines(
  ctx: Ctx,
  values: string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  font: string,
  fill: string,
  align: "left" | "center" | "right" = "left",
): void {
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  values.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function hline(
  ctx: Ctx,
  x1: number,
  y: number,
  x2: number,
  color: string,
  width = 1,
  dash?: number[],
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash ?? []);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function vline(
  ctx: Ctx,
  x: number,
  y1: number,
  y2: number,
  color: string,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();
}

function cell(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawCompanyHeader(ctx: Ctx, logo: Image | null, compact: boolean): void {
  const top = compact ? 54 : 70;
  if (logo) ctx.drawImage(logo, PAGE_MARGIN, top, 150, 62);
  text(ctx, "HONG KONG THRAIVE DIGITAL", PAGE_MARGIN + 170, top + 23, cnFont(20, 700), "#101828");
  text(ctx, "MARKETING TECHNOLOGY CO.", PAGE_MARGIN + 170, top + 50, cnFont(20, 700), "#101828");
  text(ctx, "INVOICE", PAGE_WIDTH - PAGE_MARGIN, top + 34, serifFont(compact ? 43 : 52, 700), "#101828", "right");
  hline(ctx, PAGE_MARGIN, top + 82, PAGE_WIDTH - PAGE_MARGIN, "#101828", 3);
}

function drawInvoiceMeta(ctx: Ctx, invoice: InvoicePdfData): void {
  const left = 650;
  const right = PAGE_WIDTH - PAGE_MARGIN;
  const totals = currencyTotals(invoice);
  text(ctx, "INVOICE NUMBER", left, 218, cnFont(16, 700), "#667085");
  text(ctx, invoice.invoiceNo, right, 218, cnFont(18), "#101828", "right");
  text(ctx, "INVOICE DATE", left, 252, cnFont(16, 700), "#667085");
  text(ctx, formatDate(invoice.invoiceDate), right, 252, cnFont(18), "#101828", "right");
  text(ctx, "PAYMENT DUE", left, 286, cnFont(16, 700), "#667085");
  text(ctx, formatDate(invoice.dueDate), right, 286, cnFont(18), "#101828", "right");
  hline(ctx, left, 302, right, "#d0d5dd");
  text(ctx, "AMOUNT DUE", left, 332, cnFont(16, 700), "#344054");
  const amountDue =
    totals.length === 1
      ? formatMoney(totals[0].amount, totals[0].currency)
      : "Multiple currencies — see summary";
  text(ctx, amountDue, right, 332, cnFont(20, 700), "#101828", "right");
}

function drawBillTo(ctx: Ctx, invoice: InvoicePdfData): void {
  const nameLines = wrapText(invoice.clientName, 490, 24);
  const addressLines = wrapText(invoice.clientAddress || "-", 490, 20);
  text(ctx, "BILL TO", PAGE_MARGIN, 220, cnFont(18, 700), "#667085");
  lines(ctx, nameLines, PAGE_MARGIN, 260, 24, 32, cnFont(24, 700), "#101828");
  lines(
    ctx,
    addressLines,
    PAGE_MARGIN,
    260 + nameLines.length * 32 + 14,
    20,
    28,
    cnFont(20),
    "#475467",
  );
}

function drawTableHeader(ctx: Ctx, y: number): void {
  const descriptionEnd = 735;
  const quantityEnd = 850;
  const priceEnd = 1020;
  cell(ctx, PAGE_MARGIN, y, TABLE_WIDTH, 54, "#f2f4f7", "#98a2b3");
  vline(ctx, descriptionEnd, y, y + 54, "#98a2b3");
  vline(ctx, quantityEnd, y, y + 54, "#98a2b3");
  vline(ctx, priceEnd, y, y + 54, "#98a2b3");
  text(ctx, "Items", PAGE_MARGIN + 18, y + 35, cnFont(20, 700), "#101828");
  text(ctx, "Quantity", (descriptionEnd + quantityEnd) / 2, y + 35, cnFont(20, 700), "#101828", "center");
  text(ctx, "Price", (quantityEnd + priceEnd) / 2, y + 35, cnFont(20, 700), "#101828", "center");
  text(ctx, "Amount", PAGE_WIDTH - PAGE_MARGIN - 18, y + 35, cnFont(20, 700), "#101828", "right");
}

function drawItems(ctx: Ctx, items: RenderedItem[], startY: number): number {
  let y = startY;
  for (const item of items) {
    const bottom = y + item.height;
    cell(ctx, PAGE_MARGIN, y, TABLE_WIDTH, item.height, "#ffffff", "#d0d5dd");
    vline(ctx, 735, y, bottom, "#d0d5dd");
    vline(ctx, 850, y, bottom, "#d0d5dd");
    vline(ctx, 1020, y, bottom, "#d0d5dd");
    lines(ctx, item.lines, PAGE_MARGIN + 18, y + 35, 20, 27, cnFont(20), "#101828");
    if (item.quantity) {
      text(ctx, String(item.quantity), 792, y + 35, cnFont(21), "#101828", "center");
      text(ctx, formatMoney(item.unitPrice, item.currency), 1000, y + 35, cnFont(21), "#101828", "right");
      text(ctx, formatMoney(item.amount, item.currency), PAGE_WIDTH - PAGE_MARGIN - 18, y + 35, cnFont(21), "#101828", "right");
    }
    y = bottom;
  }
  return y;
}

function drawSummary(ctx: Ctx, invoice: InvoicePdfData, startY: number): void {
  const y = startY;
  const totals = currencyTotals(invoice);
  const totalsHeight = Math.max(54, totals.length * 54);
  const bank = invoice.bankSnapshot;
  const bankLines = [
    bank.beneficiary ? `BENEFICIARY: ${bank.beneficiary}` : "",
    bank.bankName ? `Bank Name: ${bank.bankName}` : "",
    bank.bankAddress ? `Bank Address: ${bank.bankAddress}` : "",
    bank.swiftCode ? `SWIFT Code: ${bank.swiftCode}` : "",
    bank.accountNo ? `Account No.: ${bank.accountNo}` : "",
  ].filter(Boolean);
  const wrappedBankLines = bankLines.flatMap((line) => wrapText(line, 1020, 18));
  const terms = invoice.terms?.trim() || "Write transfer only.";
  const termsLines = wrapText(terms, 1020, 18);

  totals.forEach((total, index) => {
    cell(ctx, PAGE_MARGIN, y + index * 54, TABLE_WIDTH, 54, "#ffffff", "#98a2b3");
    vline(ctx, 1020, y + index * 54, y + (index + 1) * 54, "#98a2b3");
    text(ctx, `Total (${total.currency}):`, 1000, y + 35 + index * 54, cnFont(20, 700), "#101828", "right");
    text(ctx, formatMoney(total.amount, total.currency), PAGE_WIDTH - PAGE_MARGIN - 18, y + 35 + index * 54, cnFont(20, 700), "#101828", "right");
  });

  hline(ctx, PAGE_MARGIN, y + totalsHeight + 34, PAGE_WIDTH - PAGE_MARGIN, "#98a2b3", 1, [5, 4]);
  text(ctx, "Amount Due:", 930, y + totalsHeight + 76, cnFont(20, 700), "#101828", "right");
  totals.forEach((total, index) => {
    text(ctx, formatMoney(total.amount, total.currency), PAGE_WIDTH - PAGE_MARGIN, y + totalsHeight + 76 + index * 30, cnFont(20, 700), "#101828", "right");
  });
  hline(ctx, PAGE_MARGIN, y + totalsHeight + 108 + Math.max(0, totals.length - 1) * 30, PAGE_WIDTH - PAGE_MARGIN, "#d0d5dd");

  const notesY = y + totalsHeight + 157 + Math.max(0, totals.length - 1) * 30;
  text(ctx, "# Notes / Terms", PAGE_MARGIN, notesY, cnFont(18, 700), "#344054");
  lines(ctx, termsLines, PAGE_MARGIN, notesY + 34, 18, 26, cnFont(18), "#475467");

  const wireY = y + totalsHeight + 261 + Math.max(0, totals.length - 1) * 30 + Math.max(0, termsLines.length - 1) * 26;
  text(ctx, "Wire Instruction", PAGE_MARGIN, wireY, cnFont(18, 700), "#344054");
  lines(
    ctx,
    wrappedBankLines,
    PAGE_MARGIN,
    wireY + 34,
    18,
    26,
    cnFont(18),
    "#344054",
  );
}

async function drawPage(
  ctx: Ctx,
  invoice: InvoicePdfData,
  page: InvoicePage,
  pageIndex: number,
  pageCount: number,
  logo: Image | null,
): Promise<void> {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  const tableHeaderY = page.first ? 488 : 208;
  const itemStartY = tableHeaderY + 54;
  drawCompanyHeader(ctx, logo, !page.first);
  if (page.first) {
    drawBillTo(ctx, invoice);
    drawInvoiceMeta(ctx, invoice);
  }
  drawTableHeader(ctx, tableHeaderY);
  const bottom = drawItems(ctx, page.items, itemStartY);
  if (page.summary) drawSummary(ctx, invoice, bottom);

  hline(ctx, PAGE_MARGIN, 1660, PAGE_WIDTH - PAGE_MARGIN, "#eaecf0");
  text(ctx, `Thraive Hub · Invoice ${invoice.invoiceNo}`, PAGE_MARGIN, 1698, cnFont(16), "#98a2b3");
  text(ctx, `Page ${pageIndex + 1} of ${pageCount}`, PAGE_WIDTH - PAGE_MARGIN, 1698, cnFont(16), "#98a2b3", "right");
}

/**
 * Renders each A4 page with @napi-rs/canvas (which loads the CJK OTF directly)
 * and embeds the PNG into the PDF. This reliably preserves Chinese text, unlike
 * SVG @font-face which is ignored by the sharp/resvg renderer.
 */
export async function generateInvoicePdf(
  invoice: InvoicePdfData,
): Promise<Uint8Array> {
  await ensureFont();
  const logo = await logoImage().catch(() => null);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${invoice.invoiceNo}`);
  pdf.setAuthor("HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED");
  pdf.setSubject(`${invoice.clientName} · ${invoice.periodLabel}`);
  pdf.setCreator("Thraive Hub");
  pdf.setProducer("Thraive Hub");

  const pages = paginate(normalizeItems([...invoice.items]));
  for (let index = 0; index < pages.length; index += 1) {
    const canvas = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
    const ctx = canvas.getContext("2d");
    await drawPage(ctx, invoice, pages[index], index, pages.length, logo);
    const pngBytes = canvas.toBuffer("image/png");
    const image = await pdf.embedPng(pngBytes);
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawImage(image, { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT });
  }
  return pdf.save({ useObjectStreams: true });
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
