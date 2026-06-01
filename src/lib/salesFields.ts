// Sales BI system field registry.
// Each entry corresponds to one column of the
// 「各平台数据标头字段映射」 spreadsheet (row 1).
//
// `source`:
//   - "upload"  → comes directly from the uploaded data column (user maps)
//   - "formula" → auto-computed in import / display
//   - "auto"    → auto-matched (e.g. by joining AsinMapping or Affiliate library)
//   - "system"  → assigned by the system (upload time, etc.)

export type SalesFieldType = "string" | "number" | "int" | "date" | "percent";
export type SalesFieldSource = "upload" | "formula" | "auto" | "system";

export type SalesField = {
  key: string; // Prisma column name
  label: string; // 中文+英文 显示名（来自字段映射表第一行）
  type: SalesFieldType;
  source: SalesFieldSource;
  // For "formula": how it's calculated (shown in UI).
  formula?: string;
  // Default suggested width in the detail table.
  width?: number;
};

export const SALES_FIELDS: SalesField[] = [
  // 维度
  {
    key: "affiliatePlatform",
    label: "联盟平台 Affiliate Network Platform",
    type: "string",
    source: "upload",
  },
  {
    key: "affiliateProgram",
    label: "联盟类型 Affiliate Program",
    type: "string",
    source: "upload",
  },
  { key: "store", label: "店铺", type: "string", source: "upload" },
  { key: "asin", label: "ASIN", type: "string", source: "upload" },
  { key: "brand", label: "品牌 Brand", type: "string", source: "upload" },
  {
    key: "affiliateName",
    label: "平台联盟商名称 Affiliate Name on Network",
    type: "string",
    source: "upload",
  },

  // 时间
  {
    key: "orderDate",
    label: "订单日期 Order Date",
    type: "date",
    source: "upload",
  },

  // 数字（销售）
  { key: "orders", label: "订单数 Orders", type: "int", source: "upload" },
  {
    key: "unitsSold",
    label: "销售数量 Unit Sold",
    type: "int",
    source: "upload",
  },
  {
    key: "revenue",
    label: "销售金额 Revenue",
    type: "number",
    source: "upload",
  },
  {
    key: "commission",
    label: "联盟商佣金 Commission for Publishers",
    type: "number",
    source: "upload",
  },
  {
    key: "commissionRate",
    label: "联盟商佣金比例 Commission Rate %",
    type: "percent",
    source: "upload",
  },
  { key: "region", label: "地区 Region", type: "string", source: "upload" },
  {
    key: "platformFee",
    label: "平台销售额佣金",
    type: "number",
    source: "upload",
  },
  {
    key: "totalFee",
    label: "总费用 Total Fee",
    type: "number",
    source: "formula",
    formula:
      "联盟商佣金 + 平台销售额佣金 + 联盟商固定费用 + 平台固定费用 + 样品费用",
  },

  // 流量
  { key: "clicks", label: "点击量 Clicks", type: "int", source: "upload" },
  {
    key: "addToCarts",
    label: "加入购物车 Add to Carts",
    type: "int",
    source: "upload",
  },
  {
    key: "conversionRate",
    label: "转化率 Conversion Rate",
    type: "percent",
    source: "formula",
    formula: "销售数量 / 点击量",
  },

  // Campaign
  {
    key: "campaignIdName",
    label: "campaign Id/name",
    type: "string",
    source: "upload",
  },
  {
    key: "campaignSubtitle",
    label: "Campaign Subtitle",
    type: "string",
    source: "upload",
  },
  {
    key: "campaignStartDate",
    label: "Campaign Start Date 开始日期",
    type: "date",
    source: "upload",
  },
  {
    key: "campaignEndDate",
    label: "Campaign End Date 结束日期",
    type: "date",
    source: "upload",
  },
  {
    key: "campaignBudget",
    label: "Campaign Budget 预算",
    type: "number",
    source: "upload",
  },

  // 计算
  {
    key: "epc",
    label: "EPC",
    type: "number",
    source: "formula",
    formula: "联盟商佣金 / 点击量",
  },

  // 自动匹配
  {
    key: "parentAsin",
    label: "Parent Asin",
    type: "string",
    source: "auto",
    formula: "通过 ASIN 映射表匹配（品牌+店铺+地区+ASIN）",
  },
  {
    key: "storeProductLabel",
    label: "链接标签 Store-Product Label",
    type: "string",
    source: "auto",
    formula: "通过 ASIN 映射表匹配",
  },
  {
    key: "createdAt",
    label: "上传时间",
    type: "date",
    source: "system",
  },
  {
    key: "affiliateType",
    label: "联盟商类型 Type",
    type: "string",
    source: "auto",
    formula: "在联盟资源库中按平台联盟商名称匹配",
  },
  {
    key: "internalAffiliateName",
    label: "内部联盟商名称 Internal Affiliate Name",
    type: "string",
    source: "auto",
    formula: "在联盟资源库中按平台联盟商名称匹配",
  },
  {
    key: "affiliateFlatfee",
    label: "联盟商固定费用 Flatfee",
    type: "number",
    source: "upload",
  },
  {
    key: "platformFlatfee",
    label: "平台固定费用 Flatfee",
    type: "number",
    source: "upload",
  },
  {
    key: "acos",
    label: "ACOS",
    type: "percent",
    source: "formula",
    formula: "总费用 / 销售金额",
  },
  {
    key: "sampleFee",
    label: "样品费用 Sample",
    type: "number",
    source: "upload",
  },
  {
    key: "promotionLink",
    label: "推广链接 promotion link",
    type: "string",
    source: "upload",
  },
  {
    key: "revenueMoM",
    label: "销售金额月度环比",
    type: "percent",
    source: "formula",
    formula: "本月销售金额 / 上月销售金额 - 1",
  },
  {
    key: "revenueYoY",
    label: "销售金额月度同比",
    type: "percent",
    source: "formula",
    formula: "本月销售金额 / 去年同月销售金额 - 1",
  },
];

export const SALES_FIELDS_BY_KEY = Object.fromEntries(
  SALES_FIELDS.map((f) => [f.key, f]),
);

// Fields that can be selected/uploaded by the user (not auto / system).
export const UPLOAD_FIELDS = SALES_FIELDS.filter(
  (f) => f.source === "upload",
);

// Fields available for cleanup-by-filter and multi-select filter UI on dashboard.
export const FILTERABLE_DIM_FIELDS = [
  "affiliatePlatform",
  "affiliateProgram",
  "brand",
  "store",
  "region",
  "affiliateName",
  "affiliateType",
  "asin",
  "parentAsin",
  "storeProductLabel",
];
