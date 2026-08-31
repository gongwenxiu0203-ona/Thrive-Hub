export const CONTRACT_DOCUMENT_LABELS: Record<string, string> = {
  BRAND_LEGACY: "历史品牌方合同模板",
  FRAMEWORK_MASTER: "主格式合同模板（可包含项目确认书）",
  PROJECT_CONFIRMATION: "项目确认书模板",
  CHANNEL_REBATE: "渠道商返佣合同模板",
};
export function contractDocumentTypesForScope(scope: string) {
  return scope === "channel" ? ["CHANNEL_REBATE"] : scope === "brand"
    ? ["FRAMEWORK_MASTER", "PROJECT_CONFIRMATION"] : ["BRAND_LEGACY"];
}
