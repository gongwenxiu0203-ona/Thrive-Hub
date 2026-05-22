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
    aliases: [
      "品牌/店铺名称", "品牌名称", "店铺名称", "品牌", "名称", "客户名称",
      "brandName", "Brand Name", "Brand",
    ],
  },
  {
    key: "category",
    label: "品类",
    aliases: ["品类", "类目", "Amazon品类", "产品类目", "category", "Category"],
  },
  {
    key: "mainSites",
    label: "主营站点",
    aliases: ["主营站点", "主站", "站点", "销售站点", "mainSites", "Sites", "Site"],
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
    key: "platformGmv",
    label: "平台体量",
    aliases: [
      "平台体量（用户+销售）", "平台体量", "平台GMV", "平台销售额", "platformGmv",
    ],
  },
  {
    key: "amazonAcos",
    label: "亚马逊站内广告ACOS",
    aliases: ["亚马逊站内广告ACOS", "ACOS", "acos", "amazonAcos"],
  },
  {
    key: "socialMediaInfo",
    label: "社媒推广情况",
    aliases: [
      "社媒推广情况", "社媒情况", "社媒",
      "socialMediaInfo",
    ],
  },
  {
    key: "affiliateHistory",
    label: "是否做过联盟营销及相关情况",
    aliases: [
      "是否做过联盟营销及相关情况", "联盟营销情况", "推广历史", "affiliateHistory",
    ],
  },
  {
    key: "affiliatePlatforms",
    label: "具体用的联盟平台",
    aliases: [
      "具体用的联盟平台", "联盟平台", "用的平台",
      "是否用过ACC（Amazon Creator Connection）或者是否在运营其他联盟平台",
      "是否用过ACC",
      "affiliatePlatforms",
    ],
  },
  {
    key: "promotionGoals",
    label: "推广目标",
    aliases: ["推广目标", "目标", "promotionGoals", "Goal"],
  },
  {
    key: "targetGmv",
    label: "目标GMV或单量",
    aliases: [
      "目标GMV或单量", "目标GMV或单量（月）", "目标GMV", "目标单量",
      "targetGmv",
    ],
  },
  {
    key: "channelBudget",
    label: "优质渠道固定费用预算",
    aliases: [
      "优质渠道固定费用预算", "渠道预算", "固定费用预算", "预算",
      "是否有月费+抽佣的预算", "月费+抽佣预算",
      "channelBudget",
    ],
  },
  {
    key: "affiliateTeam",
    label: "是否有联盟团队",
    aliases: [
      "是否有联盟团队", "联盟团队",
      "内部是否有专门团队负责营销工作", "是否有专门团队",
      "affiliateTeam",
    ],
  },
  {
    key: "rating",
    label: "客户评估定级",
    aliases: ["客户评估定级", "客户定级", "客户评级", "评级", "rating"],
  },
  {
    key: "contactName",
    label: "联系人姓名",
    aliases: ["联系人姓名", "联系人", "对接人", "contactName", "Contact"],
  },
  {
    key: "contactEmail",
    label: "联系邮箱",
    aliases: [
      "联系邮箱", "邮箱", "Email", "email", "E-mail", "电子邮件",
      "contactEmail",
    ],
  },
  {
    key: "contactPhone",
    label: "联系电话",
    aliases: ["联系电话", "电话", "手机号", "contactPhone", "Phone", "Mobile"],
  },
];

/**
 * Suggest a column for each system field based on header similarity.
 * Alias order matters: the first alias in the list has highest priority.
 * This ensures the best semantic match wins regardless of column order.
 */
export function suggestMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>(); // prevent one column mapping to two fields

  for (const field of CUSTOMER_IMPORT_FIELDS) {
    // Try each alias in declared order (highest priority first)
    for (const alias of field.aliases) {
      const match = columns.find(
        (col) => col.trim().toLowerCase() === alias.toLowerCase(),
      );
      if (match && !used.has(match)) {
        mapping[field.key] = match;
        used.add(match);
        break;
      }
    }
  }
  return mapping;
}
