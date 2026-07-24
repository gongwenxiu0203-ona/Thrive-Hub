// 系统功能权限目录。分区和模块只负责展示；真正持久化和鉴权的是叶子 feature key。
export type PermLevel = "NONE" | "READ" | "EDIT" | "MANAGE";

export const PERM_LEVELS: PermLevel[] = ["NONE", "READ", "EDIT", "MANAGE"];

export const PERM_LEVEL_LABELS: Record<PermLevel, string> = {
  NONE: "无权限",
  READ: "只读",
  EDIT: "可编辑",
  MANAGE: "可管理",
};

export const PERM_LEVEL_COLORS: Record<PermLevel, string> = {
  NONE: "bg-slate-100 text-slate-500",
  READ: "bg-sky-100 text-sky-700",
  EDIT: "bg-amber-100 text-amber-700",
  MANAGE: "bg-emerald-100 text-emerald-700",
};

export type FeatureDefinition = {
  key: string;
  label: string;
  group: string;
  module: string;
  description?: string;
  legacyKey?: string;
};

export const FEATURE_GROUPS = [
  "工作流",
  "数据与资源",
  "财务与经营",
  "协作与门户",
  "系统管理",
] as const;

export const FEATURES: FeatureDefinition[] = [
  { key: "dashboard.view", label: "工作台概览", group: "工作流", module: "工作台", legacyKey: "dashboard" },
  { key: "customers.records", label: "客户档案", group: "工作流", module: "客户管理", legacyKey: "customers" },
  { key: "customers.followup", label: "合作进度与跟进", group: "工作流", module: "客户管理", legacyKey: "customers" },
  { key: "contracts.records", label: "合同档案", group: "工作流", module: "合同管理", legacyKey: "contracts" },
  { key: "contracts.create_upload", label: "新建与上传合同", group: "工作流", module: "合同管理", legacyKey: "contracts" },
  { key: "contracts.reviews", label: "合同审核", group: "工作流", module: "合同管理", legacyKey: "contracts" },
  { key: "contracts.templates", label: "合同模板", group: "工作流", module: "合同管理", legacyKey: "contracts" },
  { key: "contracts.signing", label: "签署与归档", group: "工作流", module: "合同管理", legacyKey: "contracts" },
  { key: "projects.records", label: "项目档案", group: "工作流", module: "项目管理", legacyKey: "tasks" },
  { key: "projects.kpi", label: "项目 KPI", group: "工作流", module: "项目管理", legacyKey: "tasks" },
  { key: "tasks.board", label: "任务看板", group: "工作流", module: "任务与工作记录", legacyKey: "tasks" },
  { key: "worklogs.records", label: "工作记录", group: "工作流", module: "任务与工作记录", legacyKey: "tasks" },

  { key: "bi.view", label: "数据查看与报表", group: "数据与资源", module: "推广数据 BI", legacyKey: "bi" },
  { key: "bi.import", label: "数据上传与导入", group: "数据与资源", module: "推广数据 BI", legacyKey: "bi" },
  { key: "bi.export", label: "数据导出", group: "数据与资源", module: "推广数据 BI", legacyKey: "bi" },
  { key: "bi.manage", label: "批量操作与数据清理", group: "数据与资源", module: "推广数据 BI", legacyKey: "bi" },
  { key: "affiliates.records", label: "联盟资源档案", group: "数据与资源", module: "联盟资源库", legacyKey: "affiliates" },
  { key: "affiliates.reviews", label: "合作审核", group: "数据与资源", module: "联盟资源库", legacyKey: "affiliates" },
  { key: "affiliates.batches", label: "批量导入与分配", group: "数据与资源", module: "联盟资源库", legacyKey: "affiliates" },
  { key: "affiliates.media", label: "媒体包与附件", group: "数据与资源", module: "联盟资源库", legacyKey: "affiliates" },

  { key: "finance.customer_reconciliation", label: "客户对账", group: "财务与经营", module: "财务对账", legacyKey: "finance_customer" },
  { key: "finance.channel_reconciliation", label: "渠道分账", group: "财务与经营", module: "财务对账", legacyKey: "finance_channel" },
  { key: "finance.affiliate_reconciliation", label: "联盟商对账与付款", group: "财务与经营", module: "财务对账", legacyKey: "finance_channel" },
  { key: "operations.revenue", label: "客户收入总表", group: "财务与经营", module: "经营管理", legacyKey: "finance_customer" },
  { key: "operations.customer_count", label: "客户数统计", group: "财务与经营", module: "经营管理", legacyKey: "finance_customer" },
  { key: "operations.accounts_receivable", label: "应收账款", group: "财务与经营", module: "经营管理", legacyKey: "finance_customer" },
  { key: "operations.invoices", label: "Invoice 开具", group: "财务与经营", module: "经营管理", legacyKey: "finance_customer" },
  { key: "operations.sales_pipeline", label: "销售漏斗", group: "财务与经营", module: "经营管理", legacyKey: "finance_customer" },
  { key: "operations.employee_kpi", label: "员工 KPI", group: "财务与经营", module: "经营管理", legacyKey: "finance_customer" },

  { key: "reminders.records", label: "提醒与通知", group: "协作与门户", module: "提醒管理", legacyKey: "reminders" },
  { key: "intake.links", label: "客户门户链接", group: "协作与门户", module: "客户门户", legacyKey: "intake" },
  { key: "intake.review", label: "信息收集审核", group: "协作与门户", module: "客户门户", legacyKey: "intake" },

  { key: "admin.users", label: "用户管理", group: "系统管理", module: "管理员面板", legacyKey: "admin" },
  { key: "admin.registration_review", label: "注册与待审核用户", group: "系统管理", module: "管理员面板", legacyKey: "admin" },
  { key: "admin.permissions", label: "权限分配", group: "系统管理", module: "管理员面板", legacyKey: "admin" },
  { key: "admin.data_quality", label: "数据质量", group: "系统管理", module: "管理员面板", legacyKey: "admin" },
  { key: "admin.audit", label: "操作审计", group: "系统管理", module: "管理员面板", legacyKey: "admin" },
  { key: "admin.api_access", label: "API 访问记录", group: "系统管理", module: "管理员面板", legacyKey: "admin" },
];

const allFeatures = (level: PermLevel) =>
  Object.fromEntries(FEATURES.map((feature) => [feature.key, level]));

const userDefaults = allFeatures("EDIT");
for (const feature of FEATURES.filter((item) => item.group === "系统管理")) {
  userDefaults[feature.key] = "NONE";
}
userDefaults["intake.links"] = "READ";
userDefaults["intake.review"] = "READ";

const brandDefaults = allFeatures("NONE");
brandDefaults["bi.view"] = "READ";
brandDefaults["reminders.records"] = "READ";

const channelDefaults = allFeatures("NONE");
channelDefaults["customers.records"] = "READ";
channelDefaults["contracts.records"] = "EDIT";
channelDefaults["contracts.create_upload"] = "EDIT";
channelDefaults["finance.customer_reconciliation"] = "READ";
channelDefaults["finance.channel_reconciliation"] = "EDIT";
channelDefaults["bi.view"] = "READ";
channelDefaults["reminders.records"] = "READ";

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, PermLevel>> = {
  ADMIN: allFeatures("MANAGE"),
  USER: userDefaults,
  BRAND: brandDefaults,
  CHANNEL: channelDefaults,
};

export const ALL_ROLES = ["ADMIN", "USER", "BRAND", "CHANNEL"] as const;

export const ROLE_LABELS_FOR_PERM: Record<string, string> = {
  ADMIN: "管理员",
  USER: "内部员工",
  BRAND: "品牌方",
  CHANNEL: "渠道商",
};

export const FEATURE_BY_KEY = new Map(
  FEATURES.map((feature) => [feature.key, feature]),
);
