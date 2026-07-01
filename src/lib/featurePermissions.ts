// 系统全部功能模块清单 + 默认角色权限
// 权限等级：NONE(无权访问) < READ(只读) < EDIT(可编辑) < MANAGE(可管理/删除/审批)

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

/** 系统功能模块清单 */
export const FEATURES: { key: string; label: string; description?: string }[] = [
  { key: "dashboard", label: "工作台", description: "首页 / 概览" },
  { key: "customers", label: "客户管理", description: "客户档案、合作进度、跟进" },
  { key: "tasks", label: "任务管理", description: "看板、Demo 制定、会议预约、合同审核任务" },
  { key: "contracts", label: "合同管理", description: "合同创建、字段级审核、签署完成" },
  { key: "finance_customer", label: "财务对账·客户对账", description: "月度对账、固费抽佣计算、确认流程" },
  { key: "finance_channel", label: "财务对账·渠道分账", description: "渠道商分账、推送凭证" },
  { key: "reminders", label: "提醒管理", description: "站内提醒、跟进通知" },
  { key: "bi", label: "推广数据 BI", description: "销售数据、归因、报表" },
  { key: "affiliates", label: "联盟资源库", description: "联盟商档案、合作状态、批量管理" },
  { key: "intake", label: "客户门户表单", description: "客户提交合作需求的对外表单" },
  { key: "admin", label: "管理员面板", description: "用户审核、权限分配、邀请注册" },
];

/** 角色默认权限（沿用现有 ROLE_BLOCKED_ROUTES 派生而来） */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, PermLevel>> = {
  // 管理员：全部 MANAGE
  ADMIN: {
    dashboard: "MANAGE",
    customers: "MANAGE",
    tasks: "MANAGE",
    contracts: "MANAGE",
    finance_customer: "MANAGE",
    finance_channel: "MANAGE",
    reminders: "MANAGE",
    bi: "MANAGE",
    affiliates: "MANAGE",
    intake: "MANAGE",
    admin: "MANAGE",
  },
  // 内部员工：除管理员面板外全部 EDIT
  USER: {
    dashboard: "EDIT",
    customers: "EDIT",
    tasks: "EDIT",
    contracts: "EDIT",
    finance_customer: "EDIT",
    finance_channel: "EDIT",
    reminders: "EDIT",
    bi: "EDIT",
    affiliates: "EDIT",
    intake: "READ",
    admin: "NONE",
  },
  // 品牌方：仅看 BI + 提醒
  BRAND: {
    dashboard: "NONE",
    customers: "NONE",
    tasks: "NONE",
    contracts: "NONE",
    finance_customer: "NONE",
    finance_channel: "NONE",
    reminders: "READ",
    bi: "READ",
    affiliates: "NONE",
    intake: "NONE",
    admin: "NONE",
  },
  // 渠道商：看客户/提醒/BI
  CHANNEL: {
    dashboard: "NONE",
    customers: "READ",
    tasks: "NONE",
    contracts: "EDIT",
    finance_customer: "READ",
    finance_channel: "EDIT",
    reminders: "READ",
    bi: "READ",
    affiliates: "NONE",
    intake: "NONE",
    admin: "NONE",
  },
  // 游客：全部 NONE
  GUEST: {
    dashboard: "NONE",
    customers: "NONE",
    tasks: "NONE",
    contracts: "NONE",
    finance_customer: "NONE",
    finance_channel: "NONE",
    reminders: "NONE",
    bi: "NONE",
    affiliates: "NONE",
    intake: "NONE",
    admin: "NONE",
  },
};

export const ALL_ROLES = ["ADMIN", "USER", "BRAND", "CHANNEL", "GUEST"] as const;

export const ROLE_LABELS_FOR_PERM: Record<string, string> = {
  ADMIN: "管理员",
  USER: "内部员工",
  BRAND: "品牌方",
  CHANNEL: "渠道商",
  GUEST: "游客",
};
