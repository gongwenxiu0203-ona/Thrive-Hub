export type ContractTemplateKey = "FIXED" | "SPECIAL" | "TIERED" | "THRESHOLD" | "INCREMENTAL";

export const CONTRACT_TEMPLATE_KEYS: ContractTemplateKey[] = [
  "FIXED",
  "SPECIAL",
  "TIERED",
  "THRESHOLD",
  "INCREMENTAL",
];

export const COMMISSION_METHOD_LABELS: Record<ContractTemplateKey, string> = {
  FIXED: "全量·固佣",
  SPECIAL: "特殊佣金",
  TIERED: "全量·阶梯式佣金",
  THRESHOLD: "全量·门槛佣金",
  INCREMENTAL: "增量·佣金",
};

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "美元", symbol: "USD" },
  { value: "EUR", label: "欧元", symbol: "EUR" },
  { value: "GBP", label: "英镑", symbol: "GBP" },
  { value: "RMB", label: "人民币", symbol: "RMB" },
] as const;

export interface TieredCommissionRule {
  from: string;
  to: string;
  rate: string;
}

export interface CommissionConfig {
  templateKey?: ContractTemplateKey;
  fixed?: { rate?: string };
  threshold?: {
    currency?: string;
    amount?: string;
    reachedRate?: string;
    unreachedRate?: string;
  };
  tiered?: {
    currency?: string;
    tiers?: TieredCommissionRule[];
  };
  incremental?: {
    baseMonths?: string;
    excessRate?: string;
  };
  special?: {
    totalCommissionRate?: string;
    salesCommissionRate?: string;
    attributionRate?: string;
    creatorRate?: string;
    stockPublisherConfirmDays?: string;
    lowGmvThresholdCurrency?: string;
    lowGmvThreshold?: string;
    lowGmvBudgetRate?: string;
    highGmvThresholdCurrency?: string;
    highGmvThreshold?: string;
    highGmvServiceRate?: string;
    rawText?: string;
  };
}

export function normalizeTemplateKey(value: unknown): ContractTemplateKey {
  if (value === "SPECIAL" || value === "TIERED" || value === "THRESHOLD" || value === "INCREMENTAL") {
    return value;
  }
  if (value === "EXCESS") return "INCREMENTAL";
  return "FIXED";
}

export function parseCommissionConfig(raw: unknown): CommissionConfig {
  if (!raw) return {};
  if (typeof raw === "object") return raw as CommissionConfig;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function stringifyCommissionConfig(config: CommissionConfig): string {
  return JSON.stringify(config ?? {});
}

export function percentText(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.endsWith("%") ? text : `${text}%`;
}

export function currencySymbol(currency: unknown): string {
  const value = String(currency ?? "").trim();
  const found = CURRENCY_OPTIONS.find((c) => c.value === value || c.label === value);
  return found?.symbol ?? value;
}

export function commissionConfigFromLegacy(input: {
  templateKey?: unknown;
  commissionType?: unknown;
  commissionRate?: unknown;
  thresholdCurrency?: unknown;
  thresholdAmount?: unknown;
  tieredRules?: unknown;
  excessBaseMonths?: unknown;
  excessCommissionRate?: unknown;
  specialCommissionTerms?: unknown;
  commissionConfig?: unknown;
}): CommissionConfig {
  const parsed = parseCommissionConfig(input.commissionConfig);
  const templateKey = normalizeTemplateKey(parsed.templateKey ?? input.templateKey ?? input.commissionType);
  const config: CommissionConfig = { ...parsed, templateKey };

  if (templateKey === "FIXED") {
    config.fixed = { rate: config.fixed?.rate ?? String(input.commissionRate ?? "") };
  }
  if (templateKey === "THRESHOLD") {
    config.threshold = {
      currency: config.threshold?.currency ?? String(input.thresholdCurrency ?? "USD"),
      amount: config.threshold?.amount ?? String(input.thresholdAmount ?? ""),
      reachedRate: config.threshold?.reachedRate ?? String(input.commissionRate ?? ""),
      unreachedRate: config.threshold?.unreachedRate ?? "",
    };
  }
  if (templateKey === "TIERED") {
    const existing = config.tiered?.tiers;
    if (existing?.length) return config;
    const legacy = parseCommissionConfig(input.tieredRules);
    config.tiered = {
      currency: config.tiered?.currency ?? String((legacy as { currency?: unknown }).currency ?? "USD"),
      tiers: Array.isArray((legacy as { tiers?: unknown }).tiers)
        ? (legacy as { tiers: TieredCommissionRule[] }).tiers
        : [{ from: "0", to: "", rate: "" }],
    };
  }
  if (templateKey === "INCREMENTAL") {
    config.incremental = {
      baseMonths: config.incremental?.baseMonths ?? String(input.excessBaseMonths ?? ""),
      excessRate: config.incremental?.excessRate ?? String(input.excessCommissionRate ?? ""),
    };
  }
  if (templateKey === "SPECIAL") {
    config.special = {
      stockPublisherConfirmDays: "10",
      ...config.special,
      rawText: config.special?.rawText ?? String(input.specialCommissionTerms ?? ""),
    };
  }
  return config;
}

export function primaryRateFromCommissionConfig(config: CommissionConfig): string {
  const key = normalizeTemplateKey(config.templateKey);
  if (key === "FIXED") return config.fixed?.rate ?? "";
  if (key === "THRESHOLD") return config.threshold?.reachedRate ?? "";
  if (key === "INCREMENTAL") return config.incremental?.excessRate ?? "";
  if (key === "SPECIAL") {
    return config.special?.totalCommissionRate
      ?? config.special?.salesCommissionRate
      ?? config.special?.attributionRate
      ?? config.special?.creatorRate
      ?? "";
  }
  return "";
}
