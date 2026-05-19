// Field template + mapping helpers for the customer Excel import flow.

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  // Header names that should auto-map to this field.
  aliases: string[];
};

export const CUSTOMER_IMPORT_FIELDS: ImportField[] = [
  {
    key: "brandName",
    label: "品牌/店铺名称",
    required: true,
    aliases: ["品牌/店铺名称", "品牌名称", "店铺名称", "品牌", "brandName", "Brand"],
  },
  {
    key: "category",
    label: "品类",
    aliases: ["品类", "类目", "category"],
  },
  {
    key: "mainSites",
    label: "主营站点",
    aliases: ["主营站点", "站点", "mainSites", "Site"],
  },
  {
    key: "competitor",
    label: "品牌竞品",
    aliases: ["品牌竞品", "竞品", "competitor"],
  },
  {
    key: "targetPlatforms",
    label: "目标推广平台",
    aliases: ["目标推广平台", "目标平台", "推广平台", "targetPlatforms"],
  },
  {
    key: "amazonAcos",
    label: "亚马逊站内广告ACOS",
    aliases: ["亚马逊站内广告ACOS", "ACOS", "acos", "amazonAcos"],
  },
  {
    key: "socialMediaInfo",
    label: "社媒推广情况",
    aliases: ["社媒推广情况", "社媒情况", "社媒", "socialMediaInfo"],
  },
  {
    key: "affiliateHistory",
    label: "是否做过联盟营销及相关情况",
    aliases: ["是否做过联盟营销及相关情况", "联盟营销情况", "推广历史", "affiliateHistory"],
  },
  {
    key: "affiliatePlatforms",
    label: "具体用的联盟平台",
    aliases: ["具体用的联盟平台", "联盟平台", "用的平台", "affiliatePlatforms"],
  },
  {
    key: "promotionGoals",
    label: "推广目标",
    aliases: ["推广目标", "目标", "promotionGoals", "Goal"],
  },
  {
    key: "targetGmv",
    label: "目标GMV或单量",
    aliases: ["目标GMV或单量", "目标GMV", "目标单量", "targetGmv"],
  },
  {
    key: "channelBudget",
    label: "优质渠道固定费用预算",
    aliases: ["优质渠道固定费用预算", "渠道预算", "固定费用预算", "预算", "channelBudget"],
  },
  {
    key: "affiliateTeam",
    label: "是否有联盟团队",
    aliases: ["是否有联盟团队", "联盟团队", "affiliateTeam"],
  },
  {
    key: "rating",
    label: "客户评估定级",
    aliases: ["客户评估定级", "客户定级", "客户评级", "评级", "rating"],
  },
  {
    key: "contactName",
    label: "联系人姓名",
    aliases: ["联系人姓名", "联系人", "contactName"],
  },
  {
    key: "contactEmail",
    label: "联系邮箱",
    aliases: ["联系邮箱", "邮箱", "contactEmail", "Email"],
  },
  {
    key: "contactPhone",
    label: "联系电话",
    aliases: ["联系电话", "电话", "contactPhone", "Phone"],
  },
];

/** Suggest a column for each system field based on header similarity. */
export function suggestMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of CUSTOMER_IMPORT_FIELDS) {
    const match = columns.find((col) => {
      const c = col.trim().toLowerCase();
      return field.aliases.some((a) => a.toLowerCase() === c);
    });
    if (match) mapping[field.key] = match;
  }
  return mapping;
}
