export const EMAIL_REPLY_CATEGORIES = [
  "DEFAULT",
  "SECURITY",
  "CUSTOMER_RECONCILIATION",
  "CHANNEL_RECONCILIATION",
  "INVOICE",
  "AFFILIATE",
] as const;

export type EmailReplyCategory = (typeof EMAIL_REPLY_CATEGORIES)[number];

export const EMAIL_REPLY_CATEGORY_LABELS: Record<EmailReplyCategory, string> = {
  DEFAULT: "默认回复邮箱",
  SECURITY: "账户安全邮件",
  CUSTOMER_RECONCILIATION: "客户对账",
  CHANNEL_RECONCILIATION: "渠道商对账",
  INVOICE: "Invoice",
  AFFILIATE: "联盟商邮件",
};

export const EMAIL_EVENT_KEYS = [
  "PASSWORD_RESET",
  "PASSWORD_CHANGED",
  "CUSTOMER_RECONCILIATION_REVIEW",
  "CUSTOMER_RECONCILIATION_RESULT",
  "CHANNEL_RECONCILIATION_REVIEW",
  "CHANNEL_RECONCILIATION_RESULT",
  "INVOICE_DELIVERY",
  "INVOICE_OVERDUE",
] as const;

export type EmailEventKey = (typeof EMAIL_EVENT_KEYS)[number];

type EmailTemplateDefinition = {
  defaultTemplateId: number;
  category: EmailReplyCategory;
  subject: (variables: Record<string, string>) => string;
};

export const EMAIL_TEMPLATES: Record<EmailEventKey, EmailTemplateDefinition> = {
  PASSWORD_RESET: {
    defaultTemplateId: 57248,
    category: "SECURITY",
    subject: () => "【Thraive】密码重置申请",
  },
  PASSWORD_CHANGED: {
    defaultTemplateId: 57259,
    category: "SECURITY",
    subject: () => "【Thraive】密码修改成功通知",
  },
  CUSTOMER_RECONCILIATION_REVIEW: {
    defaultTemplateId: 57287,
    category: "CUSTOMER_RECONCILIATION",
    subject: (variables) =>
      `【Thraive】客户对账待确认：${variables.customer_name ?? ""} ${variables.reconciliation_period ?? ""}`.trim(),
  },
  CUSTOMER_RECONCILIATION_RESULT: {
    defaultTemplateId: 57299,
    category: "CUSTOMER_RECONCILIATION",
    subject: (variables) =>
      `【Thraive】客户对账确认结果：${variables.customer_name ?? ""} ${variables.reconciliation_period ?? ""}`.trim(),
  },
  CHANNEL_RECONCILIATION_REVIEW: {
    defaultTemplateId: 57300,
    category: "CHANNEL_RECONCILIATION",
    subject: (variables) =>
      `【Thraive】渠道商对账待确认：${variables.customer_name ?? ""} ${variables.settlement_period ?? ""}`.trim(),
  },
  CHANNEL_RECONCILIATION_RESULT: {
    defaultTemplateId: 57301,
    category: "CHANNEL_RECONCILIATION",
    subject: (variables) =>
      `【Thraive】渠道商对账确认结果：${variables.customer_name ?? ""} ${variables.settlement_period ?? ""}`.trim(),
  },
  INVOICE_DELIVERY: {
    defaultTemplateId: 57302,
    category: "INVOICE",
    subject: (variables) => `Invoice ${variables.invoice_no ?? ""} · Thraive`.trim(),
  },
  INVOICE_OVERDUE: {
    defaultTemplateId: 57303,
    category: "INVOICE",
    subject: (variables) =>
      `【Thraive】Invoice 开具逾期提醒：${variables.customer_name ?? ""}`.trim(),
  },
};

export function emailTemplateId(eventKey: EmailEventKey): number {
  const envKey = `TENCENT_SES_TEMPLATE_${eventKey}`;
  const configured = Number(process.env[envKey]);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : EMAIL_TEMPLATES[eventKey].defaultTemplateId;
}

export function isEmailReplyCategory(value: unknown): value is EmailReplyCategory {
  return typeof value === "string" && EMAIL_REPLY_CATEGORIES.includes(value as EmailReplyCategory);
}
