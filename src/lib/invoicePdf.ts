import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 72;
const TABLE_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BODY_FONT =
  "'Noto Sans CJK SC','Noto Sans SC','Microsoft YaHei','WenQuanYi Micro Hei',Arial,sans-serif";

export type InvoicePdfItem = {
  feeType: string;
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
  lines: string[];
  height: number;
};

type InvoicePage = {
  items: RenderedItem[];
  first: boolean;
  summary: boolean;
};

let logoDataPromise: Promise<string> | null = null;

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

function textLines(
  lines: string[],
  x: number,
  y: number,
  options?: {
    fontSize?: number;
    lineHeight?: number;
    fill?: string;
    weight?: number;
    anchor?: "start" | "middle" | "end";
  },
): string {
  const fontSize = options?.fontSize ?? 24;
  const lineHeight = options?.lineHeight ?? Math.round(fontSize * 1.4);
  const fill = options?.fill ?? "#18212f";
  const weight = options?.weight ?? 400;
  const anchor = options?.anchor ?? "start";
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" font-family="${BODY_FONT}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(line)}</text>`,
    )
    .join("");
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

async function logoDataUri(): Promise<string> {
  logoDataPromise ??= fs
    .readFile(path.join(process.cwd(), "public", "thraive-logo.png"))
    .then((bytes) => `data:image/png;base64,${bytes.toString("base64")}`);
  return logoDataPromise;
}

function normalizeItems(items: InvoicePdfItem[]): RenderedItem[] {
  return items.map((item) => {
    const lines = wrapText(item.description, 590, 23);
    return {
      ...item,
      lines,
      height: Math.max(82, 50 + lines.length * 31),
    };
  });
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
      // A single extremely long row is capped by wrapText's available page
      // height. Descriptions beyond that are split across physical rows.
      if (!pageItems.length && item.height > bottom - startY) {
        const maxLines = Math.max(1, Math.floor((bottom - startY - 28) / 31));
        const headLines = item.lines.slice(0, maxLines);
        const tailLines = item.lines.slice(maxLines);
        pageItems.push({
          ...item,
          lines: headLines,
          height: Math.max(82, 50 + headLines.length * 31),
          // Monetary values belong to the final fragment only.
          quantity: tailLines.length ? 0 : item.quantity,
          unitPrice: tailLines.length ? 0 : item.unitPrice,
          amount: tailLines.length ? 0 : item.amount,
        });
        if (tailLines.length) {
          items[index] = {
            ...item,
            description: tailLines.join(""),
            lines: tailLines,
            height: Math.max(82, 50 + tailLines.length * 31),
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

function renderCompanyHeader(logo: string, compact = false): string {
  const top = compact ? 54 : 70;
  return `
    <image href="${logo}" x="${PAGE_MARGIN}" y="${top}" width="150" height="62" preserveAspectRatio="xMidYMid meet"/>
    <text x="${PAGE_MARGIN + 170}" y="${top + 23}" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#101828">HONG KONG THRAIVE DIGITAL</text>
    <text x="${PAGE_MARGIN + 170}" y="${top + 50}" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#101828">MARKETING TECHNOLOGY CO.</text>
    <text x="${PAGE_WIDTH - PAGE_MARGIN}" y="${top + 34}" font-family="Georgia,serif" font-size="${compact ? 43 : 52}" font-weight="700" fill="#101828" text-anchor="end">INVOICE</text>
    <line x1="${PAGE_MARGIN}" y1="${top + 82}" x2="${PAGE_WIDTH - PAGE_MARGIN}" y2="${top + 82}" stroke="#101828" stroke-width="3"/>
  `;
}

function renderInvoiceMeta(invoice: InvoicePdfData): string {
  const left = 650;
  const right = PAGE_WIDTH - PAGE_MARGIN;
  return `
    <text x="${left}" y="218" font-family="${BODY_FONT}" font-size="16" font-weight="700" fill="#667085">INVOICE NUMBER</text>
    <text x="${right}" y="218" font-family="${BODY_FONT}" font-size="18" fill="#101828" text-anchor="end">${escapeXml(invoice.invoiceNo)}</text>
    <text x="${left}" y="252" font-family="${BODY_FONT}" font-size="16" font-weight="700" fill="#667085">INVOICE DATE</text>
    <text x="${right}" y="252" font-family="${BODY_FONT}" font-size="18" fill="#101828" text-anchor="end">${escapeXml(formatDate(invoice.invoiceDate))}</text>
    <text x="${left}" y="286" font-family="${BODY_FONT}" font-size="16" font-weight="700" fill="#667085">PAYMENT DUE</text>
    <text x="${right}" y="286" font-family="${BODY_FONT}" font-size="18" fill="#101828" text-anchor="end">${escapeXml(formatDate(invoice.dueDate))}</text>
    <line x1="${left}" y1="302" x2="${right}" y2="302" stroke="#d0d5dd" stroke-width="1"/>
    <text x="${left}" y="332" font-family="${BODY_FONT}" font-size="16" font-weight="700" fill="#344054">AMOUNT DUE</text>
    <text x="${right}" y="332" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#101828" text-anchor="end">${escapeXml(formatMoney(invoice.totalAmount, invoice.currency))}</text>
  `;
}

function renderBillTo(invoice: InvoicePdfData): string {
  const nameLines = wrapText(invoice.clientName, 490, 24);
  const addressLines = wrapText(invoice.clientAddress || "-", 490, 20);
  return `
    <text x="${PAGE_MARGIN}" y="220" font-family="${BODY_FONT}" font-size="18" font-weight="700" fill="#667085">BILL TO</text>
    ${textLines(nameLines, PAGE_MARGIN, 260, { fontSize: 24, lineHeight: 32, weight: 700 })}
    ${textLines(addressLines, PAGE_MARGIN, 260 + nameLines.length * 32 + 14, { fontSize: 20, lineHeight: 28, fill: "#475467" })}
  `;
}

function renderTableHeader(y: number): string {
  const descriptionEnd = 735;
  const quantityEnd = 850;
  const priceEnd = 1020;
  return `
    <rect x="${PAGE_MARGIN}" y="${y}" width="${TABLE_WIDTH}" height="54" fill="#f2f4f7" stroke="#98a2b3" stroke-width="1"/>
    <line x1="${descriptionEnd}" y1="${y}" x2="${descriptionEnd}" y2="${y + 54}" stroke="#98a2b3"/>
    <line x1="${quantityEnd}" y1="${y}" x2="${quantityEnd}" y2="${y + 54}" stroke="#98a2b3"/>
    <line x1="${priceEnd}" y1="${y}" x2="${priceEnd}" y2="${y + 54}" stroke="#98a2b3"/>
    <text x="${PAGE_MARGIN + 18}" y="${y + 35}" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#101828">Items</text>
    <text x="${(descriptionEnd + quantityEnd) / 2}" y="${y + 35}" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#101828" text-anchor="middle">Qty</text>
    <text x="${(quantityEnd + priceEnd) / 2}" y="${y + 35}" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#101828" text-anchor="middle">Price</text>
    <text x="${PAGE_WIDTH - PAGE_MARGIN - 18}" y="${y + 35}" font-family="${BODY_FONT}" font-size="20" font-weight="700" fill="#101828" text-anchor="end">Amount</text>
  `;
}

function renderItems(
  items: RenderedItem[],
  startY: number,
  currency: string,
): { svg: string; bottom: number } {
  let y = startY;
  let svg = "";
  for (const item of items) {
    const bottom = y + item.height;
    const feeTypeLabel = item.feeType === "SALES_COMMISSION"
      ? "销售佣金 / Sales Commission"
      : "月度服务费 / Monthly Service Fee";
    svg += `
      <rect x="${PAGE_MARGIN}" y="${y}" width="${TABLE_WIDTH}" height="${item.height}" fill="#ffffff" stroke="#d0d5dd" stroke-width="1"/>
      <line x1="735" y1="${y}" x2="735" y2="${bottom}" stroke="#d0d5dd"/>
      <line x1="850" y1="${y}" x2="850" y2="${bottom}" stroke="#d0d5dd"/>
      <line x1="1020" y1="${y}" x2="1020" y2="${bottom}" stroke="#d0d5dd"/>
      <text x="${PAGE_MARGIN + 18}" y="${y + 27}" font-family="${BODY_FONT}" font-size="15" font-weight="700" fill="#6941c6">${escapeXml(feeTypeLabel)}</text>
      ${textLines(item.lines, PAGE_MARGIN + 18, y + 58, { fontSize: 23, lineHeight: 31 })}
      ${item.quantity ? `<text x="792" y="${y + 35}" font-family="${BODY_FONT}" font-size="21" fill="#101828" text-anchor="middle">${escapeXml(item.quantity)}</text>` : ""}
      ${item.quantity ? `<text x="1000" y="${y + 35}" font-family="${BODY_FONT}" font-size="21" fill="#101828" text-anchor="end">${escapeXml(formatMoney(item.unitPrice, currency))}</text>` : ""}
      ${item.quantity ? `<text x="${PAGE_WIDTH - PAGE_MARGIN - 18}" y="${y + 35}" font-family="${BODY_FONT}" font-size="21" fill="#101828" text-anchor="end">${escapeXml(formatMoney(item.amount, currency))}</text>` : ""}
    `;
    y = bottom;
  }
  return { svg, bottom: y };
}

function renderSummary(invoice: InvoicePdfData, startY: number): string {
  const y = Math.max(startY + 26, 640);
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

  return `
    <rect x="850" y="${y}" width="${PAGE_WIDTH - PAGE_MARGIN - 850}" height="58" fill="#f2f4f7"/>
    <text x="870" y="${y + 37}" font-family="${BODY_FONT}" font-size="22" font-weight="700" fill="#101828">Total</text>
    <text x="${PAGE_WIDTH - PAGE_MARGIN - 18}" y="${y + 37}" font-family="${BODY_FONT}" font-size="22" font-weight="700" fill="#101828" text-anchor="end">${escapeXml(formatMoney(invoice.totalAmount, invoice.currency))}</text>
    <text x="${PAGE_WIDTH - PAGE_MARGIN}" y="${y + 115}" font-family="${BODY_FONT}" font-size="25" font-weight="700" fill="#101828" text-anchor="end">Amount Due (${escapeXml(invoice.currency)}): ${escapeXml(formatMoney(invoice.totalAmount, invoice.currency))}</text>
    <line x1="${PAGE_MARGIN}" y1="${y + 145}" x2="${PAGE_WIDTH - PAGE_MARGIN}" y2="${y + 145}" stroke="#d0d5dd" stroke-width="2"/>
    <text x="${PAGE_MARGIN}" y="${y + 194}" font-family="${BODY_FONT}" font-size="18" font-weight="700" fill="#344054"># Notes / Terms</text>
    ${textLines(termsLines, PAGE_MARGIN, y + 228, { fontSize: 18, lineHeight: 26, fill: "#475467" })}
    <text x="${PAGE_MARGIN}" y="${y + 298 + Math.max(0, termsLines.length - 1) * 26}" font-family="${BODY_FONT}" font-size="18" font-weight="700" fill="#344054">Wire Instruction</text>
    ${textLines(wrappedBankLines, PAGE_MARGIN, y + 332 + Math.max(0, termsLines.length - 1) * 26, { fontSize: 18, lineHeight: 26, fill: "#344054" })}
  `;
}

function renderPageSvg(
  invoice: InvoicePdfData,
  page: InvoicePage,
  pageIndex: number,
  pageCount: number,
  logo: string,
): string {
  const tableHeaderY = page.first ? 488 : 208;
  const itemStartY = tableHeaderY + 54;
  const renderedItems = renderItems(page.items, itemStartY, invoice.currency);
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">
    <rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#ffffff"/>
    ${renderCompanyHeader(logo, !page.first)}
    ${page.first ? renderBillTo(invoice) + renderInvoiceMeta(invoice) : ""}
    ${renderTableHeader(tableHeaderY)}
    ${renderedItems.svg}
    ${page.summary ? renderSummary(invoice, renderedItems.bottom) : ""}
    <line x1="${PAGE_MARGIN}" y1="1660" x2="${PAGE_WIDTH - PAGE_MARGIN}" y2="1660" stroke="#eaecf0"/>
    <text x="${PAGE_MARGIN}" y="1698" font-family="${BODY_FONT}" font-size="16" fill="#98a2b3">Thraive Hub · Invoice ${escapeXml(invoice.invoiceNo)}</text>
    <text x="${PAGE_WIDTH - PAGE_MARGIN}" y="1698" font-family="${BODY_FONT}" font-size="16" fill="#98a2b3" text-anchor="end">Page ${pageIndex + 1} of ${pageCount}</text>
  </svg>`;
}

/**
 * Renders each A4 page as a high-resolution PNG before embedding it into the
 * PDF. This avoids pdf-lib's WinAnsi font limitation and preserves CJK text.
 */
export async function generateInvoicePdf(
  invoice: InvoicePdfData,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${invoice.invoiceNo}`);
  pdf.setAuthor("HONG KONG THRAIVE DIGITAL MARKETING TECHNOLOGY CO., LIMITED");
  pdf.setSubject(`${invoice.clientName} · ${invoice.periodLabel}`);
  pdf.setCreator("Thraive Hub");
  pdf.setProducer("Thraive Hub");

  const logo = await logoDataUri();
  const pages = paginate(normalizeItems([...invoice.items]));
  for (let index = 0; index < pages.length; index += 1) {
    const svg = renderPageSvg(invoice, pages[index], index, pages.length, logo);
    const pngBytes = await sharp(Buffer.from(svg))
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const image = await pdf.embedPng(pngBytes);
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: A4_HEIGHT,
    });
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
