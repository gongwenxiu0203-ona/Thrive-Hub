// Per-platform suggested column-mapping rules.
// Source: 「各平台数据标头字段映射」 spreadsheet (rows 2-13).
//
// Keys: system field (matches SalesField.key).
// Values: array of candidate raw column header names from a platform's
// export file. The import wizard picks the first one that exists in the
// uploaded sheet as the default mapping; the user can override.
//
// Special markers from the source sheet that DO NOT correspond to upload
// columns are intentionally omitted (e.g. 自动匹配 / 设定公式 / 系统匹配).

export type PlatformMapping = {
  /** Display name shown in the platform dropdown. */
  name: string;
  /** Default 联盟类型 Affiliate Program assigned to records uploaded here. */
  defaultProgram?: string;
  /** Default 地区 Region fallback when not present in source. */
  defaultRegion?: string;
  /** System field → candidate upload column headers. */
  fields: Record<string, string[]>;
};

export const PLATFORMS: PlatformMapping[] = [
  {
    name: "PartnerBoost",
    defaultProgram: "平台 Attribution",
    defaultRegion: "US",
    fields: {
      affiliateName: ["publisher name"],
      asin: ["sku"],
      brand: ["amazon product brand"],
      orderDate: ["Date"],
      unitsSold: ["quantity"],
      revenue: ["ori amount"],
      commission: ["ori commisson", "ori commission"],
      commissionRate: ["Commission ID"],
      platformFee: ["Network Fee"],
      totalFee: ["Total Spend"],
    },
  },
  {
    name: "Archer",
    defaultProgram: "平台 Attribution",
    defaultRegion: "US",
    fields: {
      asin: ["asin"],
      brand: ["brand name"],
      affiliateName: ["Affiliate Name"],
      orderDate: ["Date"],
      orders: ["total purchases"],
      unitsSold: ["Units Sold"],
      revenue: ["Sales"],
      commission: ["Commission Amount($)", "Commission Amount"],
      commissionRate: ["Commission Percentage (%)", "Commission Percentage"],
      clicks: ["Click Throughs", "Clicks"],
    },
  },
  {
    name: "Wayward-associate",
    defaultProgram: "平台 Associate",
    defaultRegion: "US",
    fields: {
      asin: ["asin"],
      brand: ["brand"],
      affiliateName: ["creator"],
      orderDate: ["Date"],
      unitsSold: ["unitsSold"],
      revenue: ["gmv"],
      commission: ["commissionOwed"],
      commissionRate: ["ccCommissionPercent"],
      platformFee: ["usageFees"],
    },
  },
  {
    name: "Wayward-attribution",
    defaultProgram: "平台 Attribution",
    defaultRegion: "US",
    fields: {
      asin: ["productId"],
      brand: ["brand"],
      affiliateName: ["creator"],
      orderDate: ["Date"],
      orders: ["purchases"],
      unitsSold: ["unitsSold"],
      revenue: ["gmv"],
      commission: ["commissionOwed"],
      platformFee: ["usageFees"],
      clicks: ["pageViews"],
      addToCarts: ["addToCarts"],
      campaignIdName: ["campaignId"],
    },
  },
  {
    name: "Amazon Creator Connection",
    defaultProgram: "ACC Associate",
    defaultRegion: "US",
    fields: {
      asin: ["ASIN"],
      affiliateName: ["Creator Name"],
      orderDate: ["Date"],
      unitsSold: ["Orders"],
      revenue: ["Sales"],
      commission: ["Spend"],
      clicks: ["Clicks"],
      campaignIdName: ["Campaign name"],
      campaignSubtitle: ["Campaign Subtitle"],
      campaignStartDate: ["Campaign Start Date"],
      campaignEndDate: ["Campaign End Date"],
      campaignBudget: ["Campaign Budget"],
    },
  },
  {
    name: "EXON",
    defaultProgram: "直接合作 Associate",
    defaultRegion: "US",
    fields: {
      asin: ["ASIN"],
      brand: ["Brand"],
      affiliateName: ["EXON"],
      orderDate: ["Date & Time"],
      unitsSold: ["Qty"],
      revenue: ["Total Price (USD)", "Total Price"],
      commission: ["Total Commission (USD)", "Total Commission"],
      commissionRate: ["Commission (%)", "Commission"],
      region: ["Geo"],
    },
  },
  {
    name: "Brainjolt",
    defaultProgram: "直接合作 Associate",
    defaultRegion: "US",
    fields: {
      asin: ["ASIN link", "ASIN"],
      affiliateName: ["Brainjolt"],
      orderDate: ["Date"],
      unitsSold: ["Quantity net"],
      revenue: ["Revenue net"],
      commission: ["Commissions net"],
      commissionRate: ["Commission rate"],
      region: ["Country"],
    },
  },
  {
    name: "Roundforest",
    defaultProgram: "直接合作 Associate",
    defaultRegion: "US",
    fields: {
      asin: ["asin"],
      brand: ["brand"],
      affiliateName: ["Roundforest"],
      orderDate: ["shipped_date"],
      unitsSold: ["num units sold"],
      revenue: ["Net_Revenue"],
      commission: ["RF_commision", "RF_commission"],
      commissionRate: ["commission rate"],
      region: ["locale"],
    },
  },
  {
    name: "折扣码",
    defaultProgram: "折扣码",
    defaultRegion: "US",
    fields: {
      asin: ["对应的Asin", "ASIN"],
      brand: ["品牌", "Brand"],
      affiliateName: [
        "Publisher / Creator Name",
        "（使用的）出版商/网红名称",
      ],
      orderDate: ["折扣码生效的第一天"],
      unitsSold: ["实际code使用次数", "order"],
      revenue: ["销售金额"],
    },
  },
  {
    name: "直接合作 Attribution",
    defaultProgram: "直接合作 Attribution",
    defaultRegion: "US",
    fields: {
      asin: ["父ASIN", "Parent ASIN"],
      brand: ["品牌", "Brand"],
      affiliateName: ["Creator Name", "网红/服务商名称"],
      orderDate: ["记录数据的每月第一天"],
      unitsSold: ["当月购买总额"],
      revenue: ["当月商品销量总计"],
      clicks: ["当月点击量"],
      addToCarts: ["当月ATC 计", "当月ATC"],
    },
  },
  {
    name: "kibeeri",
    defaultProgram: "直接合作 Associate",
    defaultRegion: "DE",
    fields: {
      asin: ["asin"],
      affiliateName: ["kibeeri"],
      orderDate: ["shipping_time"],
      unitsSold: ["items_shipped"],
      revenue: ["revenue"],
      commission: ["commission"],
      commissionRate: ["partner_commission_pct"],
    },
  },
  {
    name: "Levanta",
    defaultProgram: "平台 Attribution",
    defaultRegion: "US",
    fields: {
      asin: ["Product ID"],
      orderDate: ["Date"],
      revenue: ["Sales"],
      commission: ["Commission"],
      clicks: ["Clicks"],
      addToCarts: ["Add to Carts"],
    },
  },
];

export const PLATFORM_NAMES = PLATFORMS.map((p) => p.name);

export function getPlatform(name: string): PlatformMapping | undefined {
  return PLATFORMS.find((p) => p.name === name);
}

/** Suggest a mapping for the given platform based on what columns exist. */
export function suggestPlatformMapping(
  platform: string,
  columns: string[],
): Record<string, string> {
  const p = getPlatform(platform);
  const mapping: Record<string, string> = {};
  if (!p) return mapping;
  const lowerCols = columns.map((c) => c.trim().toLowerCase());
  for (const [systemKey, aliases] of Object.entries(p.fields)) {
    for (const a of aliases) {
      const idx = lowerCols.findIndex((c) => c === a.toLowerCase());
      if (idx >= 0) {
        mapping[systemKey] = columns[idx];
        break;
      }
    }
  }
  return mapping;
}
