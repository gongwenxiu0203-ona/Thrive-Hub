// Affiliate Library field definitions — exact labels from 资源库字段.xlsx Row 1
// Used for: Excel template generation, bulk-upload column mapping, form rendering.

import {
  AFFILIATE_SOURCE_OPTIONS,
  AFFILIATE_CATEGORY_OPTIONS,
  AFFILIATE_TYPE_OPTIONS,
  AFFILIATE_TAG_OPTIONS,
  WEBSITE_PLACEMENT_OPTIONS,
  INS_PLACEMENT_OPTIONS,
  FB_PLACEMENT_OPTIONS,
  YT_PLACEMENT_OPTIONS,
  TIKTOK_PLACEMENT_OPTIONS,
  TOP_CREATOR_OPTIONS,
  AFFILIATE_DEV_STATUS_OPTIONS,
  COOPERATION_MODE_OPTIONS,
  SAMPLE_SHIPPING_OPTIONS,
} from "./constants";

export type AffiliateFieldType =
  | "text"
  | "url"
  | "number_k" // value stored in K units
  | "currency"
  | "single_select"
  | "multi_select"
  | "email"
  | "placements"; // dynamic [{placement, flatfee}] array — special handling

export interface AffiliateField {
  key: string; // DB column name (camelCase)
  label: string; // Exact label from Excel Row 1
  type: AffiliateFieldType;
  options?: readonly string[]; // For single_select / multi_select
  group: string; // UI grouping section
  uploadable?: boolean; // Include in bulk-upload mapping wizard
  templateCol?: boolean; // Include in template download
}

export const REGION_MAP: Record<string, string> = {
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

export function normalizeRegion(v: string): string {
  const lower = v.toLowerCase().trim();
  return REGION_MAP[lower] ?? v.toUpperCase().trim();
}

export const AFFILIATE_FIELDS: AffiliateField[] = [
  // ── Core Identity ────────────────────────────────────────────────────
  {
    key: "region",
    label: "地区 Region",
    type: "text",
    group: "核心信息",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "platformAffiliateName",
    label: "平台联盟商名称 Affiliate Name on Network",
    type: "text",
    group: "核心信息",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "internalAffiliateName",
    label: "内部联盟商名称 Internal Affiliate Name",
    type: "text",
    group: "核心信息",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "source",
    label: "联盟商来源",
    type: "single_select",
    options: AFFILIATE_SOURCE_OPTIONS,
    group: "核心信息",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "category",
    label: "一级类目",
    type: "single_select",
    options: AFFILIATE_CATEGORY_OPTIONS,
    group: "核心信息",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "affiliateType",
    label: "联盟商类型 Type",
    type: "single_select",
    options: AFFILIATE_TYPE_OPTIONS,
    group: "核心信息",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "tags",
    label: "联盟商标签",
    type: "multi_select",
    options: AFFILIATE_TAG_OPTIONS,
    group: "核心信息",
    uploadable: true,
    templateCol: true,
  },
  // ── Website ──────────────────────────────────────────────────────────
  {
    key: "websiteLink",
    label: "Website link",
    type: "url",
    group: "Website",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "websiteTraffic",
    label: "【单位K】月流量Monthly Traffic",
    type: "number_k",
    group: "Website",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "websitePlacements",
    label: "Website版位 / Website Flatfee",
    type: "placements",
    options: WEBSITE_PLACEMENT_OPTIONS,
    group: "Website",
    uploadable: false,
    templateCol: false,
  },
  {
    key: "websitePlacement",
    label: "Website版位",
    type: "single_select",
    options: WEBSITE_PLACEMENT_OPTIONS,
    group: "Website",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "websiteFlatfee",
    label: "Website Flatfee",
    type: "currency",
    group: "Website",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "websiteNote",
    label: "website备注",
    type: "text",
    group: "Website",
    uploadable: true,
    templateCol: true,
  },
  // ── Instagram ────────────────────────────────────────────────────────
  {
    key: "instagramLink",
    label: "Instagram link",
    type: "url",
    group: "Instagram",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "insFollowers",
    label: "【单位K】INS粉丝数 Followers",
    type: "number_k",
    group: "Instagram",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "instagramPlacements",
    label: "INS版位 / Instagram Flatfee",
    type: "placements",
    options: INS_PLACEMENT_OPTIONS,
    group: "Instagram",
    uploadable: false,
    templateCol: false,
  },
  {
    key: "instagramPlacement",
    label: "INS版位",
    type: "single_select",
    options: INS_PLACEMENT_OPTIONS,
    group: "Instagram",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "instagramFlatfee",
    label: "Instagram Flatfee",
    type: "currency",
    group: "Instagram",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "insNote",
    label: "INS备注",
    type: "text",
    group: "Instagram",
    uploadable: true,
    templateCol: true,
  },
  // ── Facebook ─────────────────────────────────────────────────────────
  {
    key: "facebookLink",
    label: "Facebook link",
    type: "url",
    group: "Facebook",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "fbFollowers",
    label: "【单位K】FB粉丝数 Followers",
    type: "number_k",
    group: "Facebook",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "facebookPlacements",
    label: "Facebook版位 / Facebook Flatfee",
    type: "placements",
    options: FB_PLACEMENT_OPTIONS,
    group: "Facebook",
    uploadable: false,
    templateCol: false,
  },
  {
    key: "facebookPlacement",
    label: "Facebook版位",
    type: "single_select",
    options: FB_PLACEMENT_OPTIONS,
    group: "Facebook",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "facebookFlatfee",
    label: "Facebook Flatfee",
    type: "currency",
    group: "Facebook",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "fbNote",
    label: "FB备注",
    type: "text",
    group: "Facebook",
    uploadable: true,
    templateCol: true,
  },
  // ── YouTube ──────────────────────────────────────────────────────────
  {
    key: "youtubeLink",
    label: "YouTube link",
    type: "url",
    group: "YouTube",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "youtubeFollowers",
    label: "【单位K】YouTube粉丝数 Followers",
    type: "number_k",
    group: "YouTube",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "youtubePlacements",
    label: "YouTube版位 / YouTube Flatfee",
    type: "placements",
    options: YT_PLACEMENT_OPTIONS,
    group: "YouTube",
    uploadable: false,
    templateCol: false,
  },
  {
    key: "youtubePlacement",
    label: "YouTube版位",
    type: "single_select",
    options: YT_PLACEMENT_OPTIONS,
    group: "YouTube",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "youtubeFlatfee",
    label: "YouTube Flatfee",
    type: "currency",
    group: "YouTube",
    uploadable: true,
    templateCol: true,
  },
  // ── TikTok ───────────────────────────────────────────────────────────
  {
    key: "tiktokLink",
    label: "TikTok link",
    type: "url",
    group: "TikTok",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "tiktokFollowers",
    label: "【单位K】TikTok粉丝数 Followers",
    type: "number_k",
    group: "TikTok",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "tiktokPlacements",
    label: "TikTok版位 / TikTok Flatfee",
    type: "placements",
    options: TIKTOK_PLACEMENT_OPTIONS,
    group: "TikTok",
    uploadable: false,
    templateCol: false,
  },
  {
    key: "tiktokPlacement",
    label: "TikTok版位",
    type: "single_select",
    options: TIKTOK_PLACEMENT_OPTIONS,
    group: "TikTok",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "tiktokFlatfee",
    label: "TikTok Flatfee",
    type: "currency",
    group: "TikTok",
    uploadable: true,
    templateCol: true,
  },
  // ── Amazon Storefront ────────────────────────────────────────────────
  {
    key: "amazonStorefrontLink",
    label: "Amazon storefront link",
    type: "url",
    group: "Amazon Storefront",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "topCreator",
    label: "Top Creator",
    type: "single_select",
    options: TOP_CREATOR_OPTIONS,
    group: "Amazon Storefront",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "storefrontFlatfee",
    label: "Storefront flatfee",
    type: "currency",
    group: "Amazon Storefront",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "storefrontNote",
    label: "Storefront备注",
    type: "text",
    group: "Amazon Storefront",
    uploadable: true,
    templateCol: true,
  },
  // ── LTK ─────────────────────────────────────────────────────────────
  {
    key: "ltkLink",
    label: "LTK link",
    type: "url",
    group: "LTK",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "ltkFlatfee",
    label: "LTK flatfee",
    type: "currency",
    group: "LTK",
    uploadable: true,
    templateCol: true,
  },
  // ── Pinterest ────────────────────────────────────────────────────────
  {
    key: "pinterestLink",
    label: "Pinterest link",
    type: "url",
    group: "Pinterest",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "pinterestFlatfee",
    label: "Pinterest flatfee",
    type: "currency",
    group: "Pinterest",
    uploadable: true,
    templateCol: true,
  },
  // ── 其他 ─────────────────────────────────────────────────────────────
  {
    key: "flatfeeSupplementary",
    label: "Flatfee合作费用 【补充】",
    type: "text",
    group: "其他",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "note",
    label: "备注",
    type: "text",
    group: "其他",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "contactInfo",
    label: "联系方式 contact information",
    type: "url",
    group: "其他",
    uploadable: true,
    templateCol: true,
  },
  // ── 开发管理 ─────────────────────────────────────────────────────────
  {
    key: "brand",
    label: "品牌 Brand",
    type: "text",
    group: "开发管理",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "developmentStatus",
    label: "开发状态Status",
    type: "single_select",
    options: AFFILIATE_DEV_STATUS_OPTIONS,
    group: "开发管理",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "developmentDesc",
    label: "开发情况描述",
    type: "text",
    group: "开发管理",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "personInChargeName",
    label: "负责人 Person in Charge",
    type: "text",
    group: "开发管理",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "contactEmail",
    label: "负责人建联邮箱",
    type: "email",
    group: "开发管理",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "cooperationMode",
    label: "合作模式",
    type: "multi_select",
    options: COOPERATION_MODE_OPTIONS,
    group: "开发管理",
    uploadable: true,
    templateCol: true,
  },
  {
    key: "sampleShipping",
    label: "样品寄送",
    type: "single_select",
    options: SAMPLE_SHIPPING_OPTIONS,
    group: "开发管理",
    uploadable: true,
    templateCol: true,
  },
];

// Fields used in the upload wizard column-mapping step
export const UPLOADABLE_AFFILIATE_FIELDS = AFFILIATE_FIELDS.filter(
  (f) => f.uploadable,
);

// Fields for Excel template columns
export const TEMPLATE_AFFILIATE_FIELDS = AFFILIATE_FIELDS.filter(
  (f) => f.templateCol,
);

// Flat-fee placement helper
export interface PlacementEntry {
  placement: string;
  flatfee: number | null;
}

export function parsePlacements(json: string): PlacementEntry[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

export function stringifyPlacements(entries: PlacementEntry[]): string {
  return JSON.stringify(entries.filter((e) => e.placement));
}

// Similarity check for deduplication (simple normalised Levenshtein distance)
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function similarityScore(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// Returns true if two affiliate names are similar enough to flag as duplicate
export function mightBeDuplicate(a: string, b: string): boolean {
  return similarityScore(a, b) >= 0.8;
}
