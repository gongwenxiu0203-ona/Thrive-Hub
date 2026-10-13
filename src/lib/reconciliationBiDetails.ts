import type { ContractConfirmationDraft } from "./contractConfirmationDraft";

export type ReconciliationBiDetail = {
  key: string;
  brand: string;
  region: string;
  affiliatePlatform: string;
  orders: number;
  salesAmount: number;
  adjustedSalesAmount: number;
  commissionAmount: number;
};

export type ReconciliationBiSnapshot = {
  version: 1;
  pulledAt: string;
  filters: {
    period: string;
    brands: string[];
    scopes: Array<{ region: string; affiliatePlatforms: string[] }>;
    productScope: "ALL" | "SPECIFIED";
    productTokens?: string[];
  };
  details: ReconciliationBiDetail[];
};

type SalesRow = {
  brand: string;
  region: string | null;
  affiliatePlatform: string;
  asin?: string | null;
  parentAsin?: string | null;
  promotionLink?: string | null;
  orders: number;
  revenue: number;
};

const REGION_ALIASES: Record<string, string[]> = {
  US: ["us", "usa", "unitedstates", "unitedstatesofamerica", "美国", "美國", "美国站"],
  CA: ["ca", "canada", "加拿大", "加拿大站"],
  UK: ["uk", "gb", "greatbritain", "unitedkingdom", "英国", "英國", "英国站"],
  DE: ["de", "germany", "德国", "德國", "德国站"],
  FR: ["fr", "france", "法国", "法國", "法国站"],
  IT: ["it", "italy", "意大利", "義大利", "意大利站"],
  ES: ["es", "spain", "西班牙", "西班牙站"],
  AU: ["au", "australia", "澳大利亚", "澳大利亞", "澳洲"],
  JP: ["jp", "japan", "日本", "日本站"],
  HK: ["hk", "hongkong", "香港", "中国香港", "中國香港"],
  CN: ["cn", "china", "中国", "中國", "中国站"],
};

function normalized(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9\p{L}\p{N}]+/gu, "");
}

export function canonicalRegion(value: string | null | undefined) {
  const key = normalized(value);
  for (const [region, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.map(normalized).includes(key)) return region;
  }
  return String(value ?? "").trim().toUpperCase();
}

export function canonicalPlatform(value: string | null | undefined) {
  const key = normalized(value);
  if (key === "acc" || key.includes("creatorconnection")) return "Amazon Creator Connection";
  if (key === "pb" || key.includes("partnerboost")) return "PartnerBoost";
  if (key.includes("attribution")) return "Amazon Attribution";
  if (["无", "none", "na", "n/a"].includes(key)) return "";
  return String(value ?? "").trim();
}

export function biDetailKey(brand: string, region: string | null | undefined, affiliatePlatform: string) {
  return [brand.trim(), canonicalRegion(region) || "未标注地区", canonicalPlatform(affiliatePlatform) || "未标注平台"].map(encodeURIComponent).join("|");
}

export function matchesBiDetail(detail: ReconciliationBiDetail, row: { brand: string; region: string | null; affiliatePlatform: string }) {
  return normalized(detail.brand) === normalized(row.brand)
    && canonicalRegion(detail.region) === canonicalRegion(row.region)
    && normalized(canonicalPlatform(detail.affiliatePlatform)) === normalized(canonicalPlatform(row.affiliatePlatform));
}

export function matchesBiProduct(snapshot: ReconciliationBiSnapshot, row: { asin?: string | null; parentAsin?: string | null; promotionLink?: string | null }) {
  if (snapshot.filters.productScope !== "SPECIFIED") return true;
  const products = snapshot.filters.productTokens ?? [];
  if (!products.length) return false;
  const rowTokens = [row.asin, row.parentAsin, row.promotionLink].map(normalized).filter(Boolean);
  return rowTokens.some((token) => products.some((product) => token.includes(product) || product.includes(token)));
}

export function invoiceBiLineAllocations(details: ReconciliationBiDetail[], amount: number) {
  if (details.some((detail) => detail.adjustedSalesAmount < 0)) {
    throw new Error("BI 分项含负销售额或退款，无法自动拆分 Invoice；请先核对并调整对账明细。");
  }
  const total = details.reduce((sum, detail) => sum + detail.adjustedSalesAmount, 0);
  if (total <= 0) throw new Error("BI 分项销售额合计必须大于 0，才能自动拆分 Invoice。");
  let allocated = 0;
  return details.map((detail, index) => {
    const value = index === details.length - 1
      ? Math.round((amount - allocated) * 100) / 100
      : Math.round(amount * detail.adjustedSalesAmount / total * 100) / 100;
    allocated += value;
    return value;
  });
}

function acceptedPlatforms(values: string[]) {
  return [...new Set(values.map(canonicalPlatform).filter(Boolean))];
}

function matchesPlatform(actual: string, expected: string) {
  return normalized(canonicalPlatform(actual)) === normalized(canonicalPlatform(expected));
}

function productTokens(draft: ContractConfirmationDraft) {
  if (draft.productScope !== "SPECIFIED") return [];
  return draft.products.flatMap((product) => {
    const raw = product.asinOrUrl.trim();
    const match = raw.match(/(?:\/dp\/|\/gp\/product\/|asin[=/])([A-Z0-9]{10})/i);
    return [raw, match?.[1] ?? ""].map(normalized).filter(Boolean);
  });
}

export function buildBiSnapshot(input: {
  rows: SalesRow[];
  draft: ContractConfirmationDraft;
  periodLabel: string;
  previous?: ReconciliationBiSnapshot | null;
  detailKey?: string | null;
  commissionAmount: number;
}): ReconciliationBiSnapshot {
  const brandKey = normalized(input.draft.brand);
  const scopes = input.draft.scopes.map((scope) => ({
    region: canonicalRegion(scope.country),
    affiliatePlatforms: acceptedPlatforms([...scope.programs, ...scope.thirdPartyPlatforms]),
  }));
  const products = productTokens(input.draft);
  const grouped = new Map<string, ReconciliationBiDetail>();

  for (const row of input.rows) {
    if (!brandKey || normalized(row.brand) !== brandKey) continue;
    const region = canonicalRegion(row.region);
    const scope = scopes.find((candidate) => candidate.region === region);
    if (!scope) continue;
    if (scope.affiliatePlatforms.length && !scope.affiliatePlatforms.some((platform) => matchesPlatform(row.affiliatePlatform, platform))) continue;
    if (products.length) {
      const rowTokens = [row.asin, row.parentAsin, row.promotionLink].map(normalized).filter(Boolean);
      if (!rowTokens.some((token) => products.some((product) => token.includes(product) || product.includes(token)))) continue;
    }
    const platform = canonicalPlatform(row.affiliatePlatform) || "未标注平台";
    const key = biDetailKey(input.draft.brand, region, platform);
    const current = grouped.get(key) ?? {
      key, brand: input.draft.brand.trim(), region: region || "未标注地区", affiliatePlatform: platform,
      orders: 0, salesAmount: 0, adjustedSalesAmount: 0, commissionAmount: 0,
    };
    current.orders += row.orders;
    current.salesAmount += row.revenue;
    current.adjustedSalesAmount += row.revenue;
    grouped.set(key, current);
  }

  let details = [...grouped.values()].sort((a, b) => a.region.localeCompare(b.region) || a.affiliatePlatform.localeCompare(b.affiliatePlatform));
  if (input.detailKey && input.previous) {
    const refreshed = details.find((line) => line.key === input.detailKey) ?? null;
    details = input.previous.details.map((line) => line.key === input.detailKey
      ? (refreshed ?? { ...line, orders: 0, salesAmount: 0, adjustedSalesAmount: 0 })
      : line);
  }
  const totalSales = details.reduce((sum, line) => sum + line.adjustedSalesAmount, 0);
  let allocated = 0;
  details = details.map((line, index) => {
    const commissionAmount = index === details.length - 1
      ? Math.round((input.commissionAmount - allocated) * 100) / 100
      : totalSales > 0 ? Math.round(input.commissionAmount * line.adjustedSalesAmount / totalSales * 100) / 100 : 0;
    allocated += commissionAmount;
    return { ...line, commissionAmount };
  });
  return {
    version: 1,
    pulledAt: new Date().toISOString(),
    filters: { period: input.periodLabel, brands: [input.draft.brand.trim()], scopes, productScope: input.draft.productScope, productTokens: products },
    details,
  };
}

export function readBiSnapshot(ruleSnapshot: string | null | undefined): ReconciliationBiSnapshot | null {
  try {
    const value = JSON.parse(ruleSnapshot || "{}") as { biDetails?: ReconciliationBiSnapshot };
    return value.biDetails?.version === 1 && Array.isArray(value.biDetails.details) ? value.biDetails : null;
  } catch { return null; }
}

export function writeBiSnapshot(ruleSnapshot: string | null | undefined, snapshot: ReconciliationBiSnapshot) {
  let root: Record<string, unknown> = {};
  try { root = JSON.parse(ruleSnapshot || "{}"); } catch { root = {}; }
  return JSON.stringify({ ...root, biDetails: snapshot });
}

export function applyBiAdjustments(ruleSnapshot: string | null | undefined, adjustments: Array<{ key: string; amount: number }>) {
  const snapshot = readBiSnapshot(ruleSnapshot);
  if (!snapshot) return null;
  const byKey = new Map(adjustments.map((item) => [item.key, item.amount]));
  if (byKey.size !== snapshot.details.length || snapshot.details.some((line) => !byKey.has(line.key))) return null;
  return { ...snapshot, details: snapshot.details.map((line) => ({ ...line, adjustedSalesAmount: byKey.get(line.key)! })) };
}

export function allocateBiCommission(snapshot: ReconciliationBiSnapshot, commissionTotal: number) {
  const salesTotal = snapshot.details.reduce((sum, line) => sum + line.adjustedSalesAmount, 0);
  let allocated = 0;
  return {
    ...snapshot,
    details: snapshot.details.map((line, index) => {
      const amount = index === snapshot.details.length - 1
        ? Math.round((commissionTotal - allocated) * 100) / 100
        : salesTotal > 0 ? Math.round(commissionTotal * line.adjustedSalesAmount / salesTotal * 100) / 100 : 0;
      allocated += amount;
      return { ...line, commissionAmount: amount };
    }),
  };
}
