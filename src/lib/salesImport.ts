// BI sales-data import helpers. Replaces the legacy 11-field implementation.

import type { Prisma } from "@prisma/client";
import { SALES_FIELDS, SALES_FIELDS_BY_KEY } from "./salesFields";
import { suggestPlatformMapping, getPlatform } from "./platformMappings";
import { capitalizeBrandName } from "./brandName";

export { SALES_FIELDS, UPLOAD_FIELDS } from "./salesFields";

/** Row type after sheet_to_json. */
export type RawRow = Record<string, unknown>;

/** Expected source-data errors are reported with their Excel row by the API. */
export class SalesImportValidationError extends Error {
  constructor(message: string) { super(message); this.name = "SalesImportValidationError"; }
}

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

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function nullableText(v: unknown): string | null {
  return isBlank(v) ? null : String(v).trim();
}

function optionalUnits(v: unknown): number | null {
  if (isBlank(v)) return null;
  const value = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  if (!Number.isSafeInteger(value)) throw new SalesImportValidationError("销售数量必须为有效整数；未提供时请留空");
  return value;
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
  "美国": "US", "加拿大": "CA", "英国": "UK", "德国": "DE", "日本": "JP",
  "法国": "FR", "澳大利亚": "AU", "墨西哥": "MX", "意大利": "IT", "西班牙": "ES",
};
function normalizeRegion(v: string): string {
  const lower = v.toLowerCase().trim();
  return REGION_MAP[lower] ?? v.toUpperCase().trim();
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const dateOnly = typeof v === "string" ? v.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/) : null;
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
  }
  const excelSerial = typeof v === "number"
    ? v
    : typeof v === "string" && /^\d{5}(?:\.\d+)?$/.test(v.trim())
      ? Number(v.trim())
      : null;
  if (excelSerial !== null) {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + excelSerial * 86400000);
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
  customerBrandName?: string | null,
): { record: ConvertedRecord; error?: string } | null {
  // Resolve the actual platform: prefer file column value, fall back to selected
  const mappedPlatform = mapping.affiliatePlatform
    ? String(pick(row, mapping.affiliatePlatform) ?? "").trim()
    : "";
  const resolvedPlatform = mappedPlatform || platform;
  const p = getPlatform(resolvedPlatform);
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

  const unitsSold = optionalUnits(pick(row, mapping.unitsSold));
  const clicks = toInt(pick(row, mapping.clicks));

  const conversionRate = unitsSold !== null && clicks > 0 ? unitsSold / clicks : null;
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

  const rawRegion = nullableText(pick(row, mapping.region));
  const selectedPlatform = getPlatform(platform);
  if ((p?.requireRegion || selectedPlatform?.requireRegion) && !rawRegion) {
    throw new SalesImportValidationError(`${p?.name || selectedPlatform?.name || platform} 数据必须提供地区 Region，不能自动填为 US`);
  }
  const rawLockDate = pick(row, mapping.lockDate);
  const lockDate = isBlank(rawLockDate) ? null : toDate(rawLockDate);
  if (!isBlank(rawLockDate) && !lockDate) {
    throw new SalesImportValidationError("锁定日期 Lock Date 格式无效；状态文字请映射到「锁定／佣金状态」，没有日期可留空");
  }

  const record: ConvertedRecord = {
    affiliatePlatform: resolvedPlatform || platform,
    affiliateProgram:
      (pick(row, mapping.affiliateProgram) as string | undefined) ||
      p?.defaultProgram ||
      null,
    store: nullableText(pick(row, mapping.store)),
    asin: nullableText(pick(row, mapping.asin)),
    brand: capitalizeBrandName(
      ((pick(row, mapping.brand) as string | undefined) || "").toString() ||
      customerBrandName ||
      "",
    ),
    affiliateName:
      ((pick(row, mapping.affiliateName) as string | undefined) || "")
        .toString()
        .trim() || "",
    publisherId: nullableText(pick(row, mapping.publisherId)),
    publisherUrl: nullableText(pick(row, mapping.publisherUrl)),
    region: normalizeRegion(rawRegion || p?.defaultRegion || "US"),
    orderDate,
    lockDate,
    lockStatus: nullableText(pick(row, mapping.lockStatus)),
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
    storeProductLabel:
      ((pick(row, mapping.storeProductLabel) as string | undefined) || "").toString().trim() || null,
    parentAsin:
      ((pick(row, mapping.parentAsin) as string | undefined) || "").toString().trim() || null,
    customerId,
  };

  // Brand fallback: when source has no brand column, system匹配 uses the
  // selected customer's brand on the importer side (set by caller).

  if (!record.brand && !record.affiliateName) {
    return null; // empty row
  }
  return { record };
}

// Required fields for upload mapping
const REQUIRED_KEYS = new Set([
  "brand",
  "affiliateName",
  "orderDate",
  "revenue",
  "commission",
  "commissionRate",
  "region",
  "affiliatePlatform",
]);

// Hint text shown in mapping table for special fallback fields
export const FIELD_HINTS: Record<string, string> = {
  brand: "不映射时默认使用关联客户品牌名",
  affiliatePlatform: "不映射时使用上方所选联盟平台",
  commissionRate: "不映射时自动计算（联盟商佣金 ÷ 销售金额）",
};

export const OPTIONAL_FIELD_HINTS: Record<string, string> = {
  store: "非必填；未提供时不按店铺匹配 ASIN 信息",
  asin: "非必填；未提供时不自动补足商品信息",
  unitsSold: "非必填；空值表示未提供，不视为零销量",
  publisherId: "非必填；按文本保存，保留前导零；不同平台的 ID 不合并",
  publisherUrl: "非必填；独立保存，不覆盖推广链接",
  lockDate: "非必填；只填写日期，没有日期可留空",
  lockStatus: "非必填；Lock Status / commission_status 等状态文字填写在此处",
};

/** Get a stripped-down list of fields the user maps in the wizard. */
export function getMappableFields() {
  // Show affiliatePlatform first in the list, then other required fields, then optional
  const ordered = [
    ...SALES_FIELDS.filter((f) => f.key === "affiliatePlatform"),
    ...SALES_FIELDS.filter((f) => f.source === "upload" && f.key !== "affiliatePlatform"),
  ];
  return ordered.map((f) => ({
    key: f.key,
    label: f.label,
    required: REQUIRED_KEYS.has(f.key),
    type: f.type,
  }));
}

export { SALES_FIELDS_BY_KEY };
