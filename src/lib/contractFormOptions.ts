export const CONTRACT_STANDARD_PLATFORMS = [
  "亚马逊（Amazon）",
  "独立站",
  "沃尔玛（Walmart）",
] as const;

export const CONTRACT_TARGET_SITES = [
  "美国站",
  "英国站",
  "德国站",
  "法国",
  "西班牙",
  "加拿大",
  "澳洲",
  "日本",
] as const;

export const CONTRACT_FEE_CURRENCIES = ["人民币", "美金"] as const;
export const CONTRACT_FEE_CYCLES = ["月付", "季度预付"] as const;
export const CONTRACT_GMV_CYCLES = ["月度", "季度"] as const;

export const CONTRACT_COOP_CHANNELS = [
  { key: "ACC", label: "Amazon Creator Connections（ACC）", group: "Amazon 官方" },
  { key: "Attribution", label: "Amazon Attribution（归因链接）", group: "Amazon 官方" },
  { key: "Associates", label: "Amazon Affiliate Associates（官方联盟）", group: "Amazon 官方" },
  { key: "AmazonLive", label: "Amazon Live", group: "Amazon 官方" },
  { key: "Levanta", label: "Levanta", group: "第三方联盟平台" },
  { key: "Impact", label: "Impact", group: "第三方联盟平台" },
  { key: "Wayward", label: "Wayward", group: "第三方联盟平台" },
  { key: "ArcherAffiliates", label: "Archer Affiliates", group: "第三方联盟平台" },
  { key: "PrivateSocial", label: "私域/社媒/流量渠道（Facebook/Telegram/Discord等）", group: "社媒渠道" },
] as const;
