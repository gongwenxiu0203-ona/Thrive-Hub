// Centralised enum-like value maps. Keys are stored in the DB, values are
// the Chinese labels shown in the UI.

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "管理员",
  USER: "内部员工",
  BRAND: "品牌方",
  CHANNEL: "渠道商",
  GUEST: "游客",
};

// ---- Customer: 基础信息 ----------------------------------------------------

export const MAIN_SITES = ["US", "UK", "DE", "CA", "JP"];

// ---- Customer: 推广平台 ----------------------------------------------------

export const PROMO_PLATFORMS = ["独立站", "Amazon", "沃尔玛"];

// ---- Customer: 推广目标 ----------------------------------------------------

export const PROMOTION_GOALS = ["新品推广", "老品增量", "全店业务增量"];

// ---- Customer: 进度 --------------------------------------------------------

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: "待指派",
  DEMO_IN_PROGRESS: "Demo方案制定中",
  DEMO_DONE: "Demo方案已完成",
  INTERNAL_DISCUSSION: "客户内部讨论中",
  CONTRACT_IN_PROGRESS: "合同推进中",
  CONTRACT_SIGNED: "合同签署完成",
  COOPERATING: "合作中",
  COOPERATION_DONE: "合作完成",
  PENDING: "待定",
  NOT_ADVANCED: "未推进合作",
};

// Order used to determine "most advanced" status when deriving automatically.
export const CUSTOMER_STATUS_ORDER = [
  "UNASSIGNED",
  "DEMO_IN_PROGRESS",
  "DEMO_DONE",
  "INTERNAL_DISCUSSION",
  "CONTRACT_IN_PROGRESS",
  "CONTRACT_SIGNED",
  "COOPERATING",
  "COOPERATION_DONE",
];

export const CUSTOMER_STATUS_COLORS: Record<string, string> = {
  UNASSIGNED: "bg-slate-100 text-slate-700",
  DEMO_IN_PROGRESS: "bg-sky-100 text-sky-700",
  DEMO_DONE: "bg-cyan-100 text-cyan-700",
  INTERNAL_DISCUSSION: "bg-amber-100 text-amber-700",
  CONTRACT_IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  CONTRACT_SIGNED: "bg-violet-100 text-violet-700",
  COOPERATING: "bg-emerald-100 text-emerald-700",
  COOPERATION_DONE: "bg-green-100 text-green-700",
  PENDING: "bg-orange-100 text-orange-700",
  NOT_ADVANCED: "bg-rose-100 text-rose-700",
};

// ---- Customer: Amazon 品类 --------------------------------------------------

export const AMAZON_CATEGORIES = [
  "宠物用品",
  "家居与厨房",
  "美妆个护",
  "运动户外",
  "鞋服珠宝",
  "工具与家庭装修",
  "办公用品",
  "食品杂货及美食",
  "电子产品",
  "母婴",
  "玩具与游戏",
  "庭院草坪和花园",
  "健康与家庭",
  "家用电器",
  "手机及配件",
  "其他",
] as const;

// ---- Customer: 评级 --------------------------------------------------------

export const RATING_LABELS: Record<string, string> = {
  S: "S级",
  A: "A级",
  B: "B级",
  C: "C级",
  PENDING: "待评估",
};

export const RATING_COLORS: Record<string, string> = {
  S: "bg-violet-100 text-violet-700",
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-sky-100 text-sky-700",
  C: "bg-amber-100 text-amber-700",
  PENDING: "bg-slate-100 text-slate-600",
};

// ---- Contract -------------------------------------------------------------

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  CHANNEL: "渠道商合同",
  BRAND: "品牌方合同",
  REBATE: "返佣合同",
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "合同推进中",
  REVIEWING: "合同审核中",
  REJECTED: "审核退回",
  SIGNING: "合同签署中",
  COMPLETED: "合同签署完成",
};

export const CONTRACT_STATUS_ORDER = [
  "IN_PROGRESS",
  "REVIEWING",
  "SIGNING",
  "COMPLETED",
];

export const CONTRACT_STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "bg-slate-100 text-slate-700",
  REVIEWING: "bg-amber-100 text-amber-700",
  REJECTED: "bg-rose-100 text-rose-700",
  SIGNING: "bg-sky-100 text-sky-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

export const FEE_CYCLE_OPTIONS = ["无", "月度", "季度"];

export const FEE_CURRENCY_OPTIONS = ["人民币", "美金"];

export const PAYMENT_METHOD_OPTIONS = ["", "月付", "季度预付"];

export const COMMISSION_TYPE_LABELS: Record<string, string> = {
  FIXED: "固定点数联盟归因GMV佣金",
  THRESHOLD: "联盟归因GMV门槛佣金机制",
  TIERED: "阶梯式联盟归因GMV佣金机制",
  EXCESS: "超额联盟归因GMV佣金机制",
};

export const COMMISSION_TYPE_OPTIONS = ["FIXED", "THRESHOLD", "TIERED", "EXCESS"] as const;

// 推广平台 & 目标站点（项目确认书 v3 模板）
export const CONTRACT_PROMO_PLATFORMS = [
  "亚马逊（Amazon）",
  "独立站",
  "沃尔玛（Walmart）",
] as const;

// 目标站点（与合同中 ☑美国站；□德国站… 对齐，支持多选）
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

// 联盟归因 GMV 结算周期（月 / 季度）
export const GMV_SETTLEMENT_CYCLE_OPTIONS = ["月度", "季度"] as const;

// Contract review fields, grouped for a tidy review panel (v3 template).
export const CONTRACT_REVIEW_GROUPS: {
  group: string;
  fields: { key: string; label: string }[];
}[] = [
  {
    group: "基本信息",
    fields: [
      { key: "partyA", label: "甲方（客户）" },
      { key: "contractPeriod", label: "合作期限" },
    ],
  },
  {
    group: "推广信息",
    fields: [
      { key: "promoPlatform", label: "推广平台" },
      { key: "targetSite", label: "目标站点" },
    ],
  },
  {
    group: "月度服务费",
    fields: [
      { key: "feeAmount", label: "月度服务费" },
      { key: "feeCurrency", label: "月度服务费货币" },
      { key: "paymentMethod", label: "月度服务费付款周期" },
    ],
  },
  {
    group: "联盟归因GMV佣金",
    fields: [
      { key: "commissionType", label: "GMV佣金结算方式" },
      { key: "commissionRate", label: "抽佣比例" },
      { key: "thresholdAmount", label: "GMV门槛金额" },
      { key: "thresholdCurrency", label: "门槛货币" },
      { key: "tieredRules", label: "阶梯规则" },
      { key: "excessBaseMonths", label: "基准月数" },
      { key: "excessCommissionRate", label: "增长服务佣金比例" },
      { key: "gmvSettlementCycle", label: "联盟归因GMV结算周期" },
    ],
  },
];

export const CONTRACT_REVIEW_FIELDS = CONTRACT_REVIEW_GROUPS.flatMap(
  (g) => g.fields,
);

// ---- Task -----------------------------------------------------------------

export const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: "待处理",
  IN_PROGRESS: "进行中",
  REVIEW: "待审核",
  DONE: "已完成",
  RETURNED: "已退回",
  CANCELLED: "已取消",
};

// Columns shown on the Kanban board.
export const TASK_STATUS_ORDER = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

export const TASK_STATUS_COLORS: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-sky-100 text-sky-700",
  REVIEW: "bg-amber-100 text-amber-700",
  DONE: "bg-emerald-100 text-emerald-700",
  RETURNED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-200 text-slate-500",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  LOW: "低",
  MID: "中",
  HIGH: "高",
  URGENT: "紧急",
};

export const TASK_PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MID: "bg-sky-100 text-sky-700",
  HIGH: "bg-amber-100 text-amber-700",
  URGENT: "bg-rose-100 text-rose-700",
};

export const TASK_CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "普通任务",
  DEMO_PLAN: "Demo方案制定",
  MEETING_BOOKING: "客户会议预约",
  CONTRACT_REVIEW: "合同审核",
};

export const MEETING_MODE_LABELS: Record<string, string> = {
  ONLINE: "线上会议",
  OFFLINE: "线下会议",
};

// ---- Reminder -------------------------------------------------------------

export const REMINDER_TYPE_LABELS: Record<string, string> = {
  DELIVERY: "交付",
  MEETING: "会议",
  CONTRACT_EXPIRY: "合同到期",
  REVIEW: "审核",
  FOLLOWUP: "跟进",
  STATUS_CHECK: "状态确认",
  RECONCILIATION_REVIEW: "对账审核",
  SETTLEMENT_DUE: "结算提醒",
};

export const REMINDER_TYPE_COLORS: Record<string, string> = {
  DELIVERY: "bg-emerald-100 text-emerald-700",
  MEETING: "bg-sky-100 text-sky-700",
  CONTRACT_EXPIRY: "bg-rose-100 text-rose-700",
  REVIEW: "bg-amber-100 text-amber-700",
  FOLLOWUP: "bg-indigo-100 text-indigo-700",
  STATUS_CHECK: "bg-orange-100 text-orange-700",
  RECONCILIATION_REVIEW: "bg-violet-100 text-violet-700",
  SETTLEMENT_DUE: "bg-rose-100 text-rose-700",
};

// ---- Finance: Reconciliation -----------------------------------------------

export const BET_TYPE_LABELS: Record<string, string> = {
  NONE: "无对赌",
  ORDER_COUNT: "对赌单量",
  SALES_AMOUNT: "对赌销售额",
  BOTH: "单量+销售额",
};

export const BET_TYPE_OPTIONS = ["NONE", "ORDER_COUNT", "SALES_AMOUNT", "BOTH"] as const;

export const BET_RESULT_LABELS: Record<string, string> = {
  ACHIEVED: "完成对赌",
  NOT_ACHIEVED: "未达成对赌",
  NA: "无对赌",
};

export const BET_RESULT_COLORS: Record<string, string> = {
  ACHIEVED: "bg-emerald-100 text-emerald-700",
  NOT_ACHIEVED: "bg-rose-100 text-rose-700",
  NA: "bg-slate-100 text-slate-600",
};

export const RECONCILIATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_REVIEW: "待对方确认",
  DISPUTED: "有异议",
  CONFIRMED: "已确认",
};

export const RECONCILIATION_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PENDING_REVIEW: "bg-amber-100 text-amber-700",
  DISPUTED: "bg-rose-100 text-rose-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
};

export const RECONCILIATION_STATUS_ORDER = [
  "DRAFT",
  "PENDING_REVIEW",
  "DISPUTED",
  "CONFIRMED",
] as const;

export const REVIEW_ACTION_LABELS: Record<string, string> = {
  SUBMITTED: "提交对账",
  APPROVED: "无异议确认",
  DISPUTED: "提出异议",
  FINAL_CONFIRMED: "最终确认",
};

export const REVIEW_ACTION_COLORS: Record<string, string> = {
  SUBMITTED: "bg-sky-100 text-sky-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  DISPUTED: "bg-rose-100 text-rose-700",
  FINAL_CONFIRMED: "bg-violet-100 text-violet-700",
};

export const SETTLEMENT_TYPE_LABELS: Record<string, string> = {
  FIXED_FEE: "固费",
  COMMISSION: "抽佣",
};

export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待结算",
  SETTLED: "已结算",
};

export const SETTLEMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SETTLED: "bg-emerald-100 text-emerald-700",
};

// ---- Affiliate (exact values from 资源库字段.xlsx) -------------------------

// 联盟商来源 (Excel D)
export const AFFILIATE_SOURCE_OPTIONS = [
  "LTK",
  "Iconically",
  "Levanta",
  "ACC",
  "PartnerBoost",
  "Amazon Tag search",
  "Wayward",
] as const;

// 一级类目 (Excel E)
export const AFFILIATE_CATEGORY_OPTIONS = ["Network", "Publisher"] as const;

// 联盟商类型 Type (Excel F)
export const AFFILIATE_TYPE_OPTIONS = [
  "媒体PR Media Company",
  "Content Bloger",
  "折扣(Coupon&Deals）",
  "内容型网红 Content KOL",
  "返利网站Cash Back",
  "广告投放型Media Buyer",
  "网红聚合平台Influencer Platform",
  "Sub-Network",
  "插件Browser Extension",
  "转链技术工具Link Conversion Tool",
  "待定",
] as const;

// 联盟商标签 (Excel G, 多选)
export const AFFILIATE_TAG_OPTIONS = [
  "独立站",
  "Amazon",
  "AMZ Top Creator",
  "男性向",
  "女性向",
  "推广形式-比价/榜单",
  "推广形式-测评",
  "推广渠道-Meta广告",
  "推广渠道-Google广告",
  "推广渠道-EDM营销",
  "折扣细分-折扣网站Deal website",
  "折扣细分-折扣型网红 Deal KOL",
] as const;

// Website版位 (Excel J)
export const WEBSITE_PLACEMENT_OPTIONS = ["坑位", "Newsletter"] as const;
// INS版位 (Excel O)
export const INS_PLACEMENT_OPTIONS = ["Post", "Reel", "Story"] as const;
// Facebook版位 (Excel T)
export const FB_PLACEMENT_OPTIONS = ["Post", "Reel"] as const;
// YouTube版位 (Excel Y)
export const YT_PLACEMENT_OPTIONS = ["Video"] as const;
// TikTok版位 (Excel AC)
export const TIKTOK_PLACEMENT_OPTIONS = ["Video"] as const;

// Top Creator (Excel AF, 单选 — implied boolean)
export const TOP_CREATOR_OPTIONS = ["是", "否"] as const;

// 开发状态Status (Excel AP)
export const AFFILIATE_DEV_STATUS_OPTIONS = [
  "待开发 Not Yet Contacted",
  "需要进一步开发",
  "沟通中 In Discussion",
  "审核中",
  "合作中 In Collaboration",
  "已被拒绝 Declined",
  "未合作成功 Unsuccessful Collaboration",
  "失联 losing contact",
  "搁置",
] as const;

export const AFFILIATE_DEV_STATUS_COLORS: Record<string, string> = {
  "待开发 Not Yet Contacted": "bg-slate-100 text-slate-700",
  "需要进一步开发": "bg-blue-100 text-blue-700",
  "沟通中 In Discussion": "bg-amber-100 text-amber-700",
  "审核中": "bg-orange-100 text-orange-700",
  "合作中 In Collaboration": "bg-emerald-100 text-emerald-700",
  "已被拒绝 Declined": "bg-rose-100 text-rose-700",
  "未合作成功 Unsuccessful Collaboration": "bg-pink-100 text-pink-700",
  "失联 losing contact": "bg-gray-100 text-gray-700",
  "搁置": "bg-violet-100 text-violet-700",
};

// 合作模式 (Excel AT, 多选)
export const COOPERATION_MODE_OPTIONS = [
  "纯佣",
  "flatfee",
  "佣金+flatfee",
] as const;

// 样品寄送 (Excel AU)
export const SAMPLE_SHIPPING_OPTIONS = ["是", "否", "均可"] as const;

export const AFFILIATE_PROMOTION_PLACEMENT_OPTIONS = [
  "Google Paid Search",
  "Paid Social Traffic",
  "Email newsletter",
  "Organic Social Traffic",
] as const;

// 当前客户合作状态 (per-customer cooperation status, written back by coop review)
export const AFFILIATE_COOP_STATUS_OPTIONS = [
  "待开发 Not Yet Contacted",
  "沟通中 In Discussion",
  "审核中",
  "合作中 In Collaboration",
  "已被拒绝 Declined",
  "未合作成功 Unsuccessful Collaboration",
  "搁置",
] as const;

export function labelOf(
  map: Record<string, string>,
  key: string | null | undefined,
): string {
  if (!key) return "—";
  return map[key] ?? key;
}

export const REGION_OPTIONS = ["US", "UK", "IT", "FR", "ES", "DE", "CA", "AU"] as const;
