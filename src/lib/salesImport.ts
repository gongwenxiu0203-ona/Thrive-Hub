// BI sales-data import helpers. Replaces the legacy 11-field implementation.

import type { Prisma } from "@prisma/client";
import { SALES_FIELDS, SALES_FIELDS_BY_KEY } from "./salesFields";
import { suggestPlatformMapping, getPlatform } from "./platformMappings";

export { SALES_FIELDS, UPLOAD_FIELDS } from "./salesFields";

/** Row type after sheet_to_json. */
export type RawRow = Record<string, unknown>;

function pick(row: RawRow, col: string | undefined): unknown {
  if (!col) return undefined;
  return row[col];
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[$,%\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v: unknown): number {
  return Math.round(toNumber(v));
}

function toRate(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") {
    // 0.15 → 0.15; 15 → 0.15
    return Math.abs(v) > 1 ? v / 100 : v;
  }
  const s = String(v).trim();
  if (s.endsWith("%")) return Number(s.slice(0, -1)) / 100 || 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n) > 1 ? n / 100 : n;
}

const REGION_MAP: Record<string, string> = {
  "united states": "US", "united states of america": "US",
  "united kingdom": "UK", "great britain": "UK",
  "germany": "DE", "deutschland": "DE",
  "canada": "CA",
  "japan": "JP",
  "france": "FR",
  "australia": "AU",
  "mexico": "MX",
  "italy": "IT",
  "spain": "ES",
  "netherlands": "NL",
  "sweden": "SE",
  "poland": "PL",
  "belgium": "BE",
  "austria": "AT",
  "singapore": "SG",
  "india": "IN",
};
function normalizeRegion(v: string): string {
  const lower = v.toLowerCase().trim();
  return REGION_MAP[lower] ?? v.toUpperCase().trim();
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === "number") {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Suggest a mapping for the chosen platform. */
export function suggestMapping(
  platform: string,
  columns: string[],
): Record<string, string> {
  return suggestPlatformMapping(platform, columns);
}

export type ConvertedRecord = Omit<
  Prisma.SalesRecordCreateManyInput,
  "batchId"
>;

/** Convert one raw row to a SalesRecord payload using the user's mapping. */
export function convertRow(
  row: RawRow,
  mapping: Record<string, string>,
  platform: string,
  customerId: string | null,
): { record: ConvertedRecord; error?: string } | null {
  const p = getPlatform(platform);
  const orderDate = toDate(pick(row, mapping.orderDate));
  if (!orderDate) {
    return null; // skip rows without a date
  }

  const revenue = toNumber(pick(row, mapping.revenue));
  const commission = toNumber(pick(row, mapping.commission));
  const platformFee = toNumber(pick(row, mapping.platformFee));
  const affiliateFlatfee = toNumber(pick(row, mapping.affiliateFlatfee));
  const platformFlatfee = toNumber(pick(row, mapping.platformFlatfee));
  const sampleFee = toNumber(pick(row, mapping.sampleFee));
  const totalFee =
    commission + platformFee + affiliateFlatfee + platformFlatfee + sampleFee;

  const unitsSold = toInt(pick(row, mapping.unitsSold));
  const clicks = toInt(pick(row, mapping.clicks));

  const conversionRate = clicks > 0 ? unitsSold / clicks : 0;
  const epc = clicks > 0 ? commission / clicks : 0;
  const acos = revenue > 0 ? totalFee / revenue : 0;

  let commissionRate = toRate(pick(row, mapping.commissionRate));
  if (!commissionRate && revenue > 0 && commission > 0) {
    commissionRate = commission / revenue;
  }

  // 平台 = Levanta 时，平台销售额佣金 = 销售金额 × 2.5%
  let computedPlatformFee = platformFee;
  if (platform === "Levanta" && computedPlatformFee === 0) {
    computedPlatformFee = revenue * 0.025;
  }

  const record: ConvertedRecord = {
    affiliatePlatform: platform,
    affiliateProgram:
      (pick(row, mapping.affiliateProgram) as string | undefined) ||
      p?.defaultProgram ||
      null,
    store: (pick(row, mapping.store) as string | undefined) || null,
    asin: (pick(row, mapping.asin) as string | undefined) || null,
    brand:
      ((pick(row, mapping.brand) as string | undefined) || "").toString() ||
      "",
    affiliateName:
      ((pick(row, mapping.affiliateName) as string | undefined) || "")
        .toString()
        .trim() || "",
    region: normalizeRegion(
      ((pick(row, mapping.region) as string | undefined) || p?.defaultRegion || "US").toString()
    ),
    orderDate,
    orders: toInt(pick(row, mapping.orders)),
    unitsSold,
    revenue,
    commission,
    commissionRate,
    platformFee: computedPlatformFee,
    totalFee:
      commission +
      computedPlatformFee +
      affiliateFlatfee +
      platformFlatfee +
      sampleFee,
    affiliateFlatfee,
    platformFlatfee,
    sampleFee,
    clicks,
    addToCarts: toInt(pick(row, mapping.addToCarts)),
    conversionRate,
    epc,
    acos,
    campaignIdName:
      (pick(row, mapping.campaignIdName) as string | undefined) || null,
    campaignSubtitle:
      (pick(row, mapping.campaignSubtitle) as string | undefined) || null,
    campaignStartDate: toDate(pick(row, mapping.campaignStartDate)),
    campaignEndDate: toDate(pick(row, mapping.campaignEndDate)),
    campaignBudget: toNumber(pick(row, mapping.campaignBudget)),
    promotionLink:
      (pick(row, mapping.promotionLink) as string | undefined) || null,
    customerId,
  };

  // Brand fallback: when source has no brand column, system匹配 uses the
  // selected customer's brand on the importer side (set by caller).

  if (!record.brand && !record.affiliateName) {
    return null; // empty row
  }
  return { record };
}

/** Get a stripped-down list of fields the user maps in the wizard. */
export function getMappableFields() {
  return SALES_FIELDS.filter(
    (f) => f.source === "upload" && f.key !== "affiliatePlatform",
  ).map((f) => ({
    key: f.key,
    label: f.label,
    required:
      f.key === "orderDate" ||
      f.key === "revenue" ||
      f.key === "affiliateName",
    type: f.type,
  }));
}

export { SALES_FIELDS_BY_KEY };
