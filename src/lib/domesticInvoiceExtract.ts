import path from "path";
import { extractImageTextWithOcr } from "@/lib/contractOcr";
import { extractPdfText } from "@/lib/contractPdfExtract";

export type DomesticInvoiceFields = {
  invoiceNumber?: string;
  invoiceCode?: string;
  invoiceType?: "VAT_SPECIAL" | "VAT_ORDINARY" | "ELECTRONIC";
  invoiceDate?: string;
  taxInclusiveAmount?: number;
  netAmount?: number;
  taxAmount?: number;
  taxRate?: number;
};

const money = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[,，￥¥\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : undefined;
};

function first(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

export function parseDomesticInvoiceText(
  rawText: string,
): DomesticInvoiceFields {
  const text = rawText.replace(/\r/g, "").replace(/[：﹕]/g, ":");
  const compact = text.replace(/[ \t]+/g, " ");
  const invoiceNumber = first(compact, [
    /(?:发票号码|票据号码|Invoice\s*No\.?|No\.?)\s*[:：]?\s*([0-9]{8,20})/i,
    /发票号\s*[:：]?\s*([0-9]{8,20})/,
  ]);
  const invoiceCode = first(compact, [
    /(?:发票代码|票据代码)\s*[:：]?\s*([0-9]{10,20})/,
  ]);
  const dateParts = compact.match(
    /(?:开票日期|日期)\s*[:：]?\s*(\d{4})[年.\-/](\d{1,2})[月.\-/](\d{1,2})日?/,
  );
  const invoiceDate = dateParts
    ? `${dateParts[1]}-${dateParts[2].padStart(2, "0")}-${dateParts[3].padStart(2, "0")}`
    : undefined;
  const taxInclusiveAmount = money(
    first(compact, [
    /价税合计(?:\s*[（(]小写[）)])?\s*[:：]?\s*[￥¥]?\s*([0-9][0-9,，]*\.?[0-9]{0,2})/,
      /(?:含税金额|小写)\s*[:：]?\s*[￥¥]?\s*([0-9][0-9,，]*\.?[0-9]{0,2})/,
    ]),
  );
  const totals = compact.match(
    /合\s*计\s*[￥¥]?\s*([0-9][0-9,，]*\.?[0-9]{0,2})\s*[￥¥]?\s*([0-9][0-9,，]*\.?[0-9]{0,2})/,
  );
  const netAmount =
    money(
      first(compact, [
        /(?:金额合计|合计金额|不含税金额)\s*[:：]?\s*[￥¥]?\s*([0-9][0-9,，]*\.?[0-9]{0,2})/,
      ]),
    ) ?? money(totals?.[1]);
  const taxAmount =
    money(
      first(compact, [
        /(?:税额合计|合计税额)\s*[:：]?\s*[￥¥]?\s*([0-9][0-9,，]*\.?[0-9]{0,2})/,
      ]),
    ) ?? money(totals?.[2]);
  const rateText = first(compact, [
    /(?:税率|征收率)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/,
    /\s(\d+(?:\.\d+)?)\s*%\s/,
  ]);
  const taxRate = rateText ? Number(rateText) : undefined;
  const invoiceType = /专用发票/.test(compact)
    ? "VAT_SPECIAL"
    : /电子/.test(compact)
      ? "ELECTRONIC"
      : /普通发票/.test(compact)
        ? "VAT_ORDINARY"
        : undefined;
  return {
    invoiceNumber,
    invoiceCode,
    invoiceType,
    invoiceDate,
    taxInclusiveAmount,
    netAmount,
    taxAmount,
    taxRate,
  };
}

export async function extractDomesticInvoice(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const text =
    file.type === "application/pdf"
      ? await extractPdfText(buffer)
      : await extractImageTextWithOcr(buffer, path.extname(file.name));
  return { text, fields: parseDomesticInvoiceText(text) };
}
