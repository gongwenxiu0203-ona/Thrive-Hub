/** Pure, new-confirmation rules. Never reads or changes legacy contract accounting. */
export type ConfirmationCommissionMode = "GMV_SERVICE" | "PACKAGE";
export type ConfirmationCommissionScope = "ALL" | "CAMPAIGN" | "PUBLISHER" | "EXCESS";

export function parseConfirmationAmount(value: unknown, label = "金额"): number {
  if (typeof value !== "number" && typeof value !== "string") throw new Error(`${label}必须填写有效数字`);
  if (typeof value === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
    throw new Error(`${label}必须填写非负数字，不支持符号或分隔符`);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label}必须为安全范围内的有限非负数字`);
  }
  return amount;
}

/** Explicit percentage semantics: 1 and "1%" both mean one percent. */
export function parseConfirmationPercent(value: unknown, label = "抽佣比例"): number {
  const normalized = typeof value === "string" ? value.trim().replace(/%$/, "") : value;
  const percent = parseConfirmationAmount(normalized, label);
  if (percent > 100) throw new Error(`${label}不能超过100%`);
  return percent;
}

export function assertConfirmationCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw new Error("币种必须使用三位大写货币代码");
  // ICU's ISO currency registry, not Intl.NumberFormat (which also accepts fictitious codes).
  const supported = (Intl as typeof Intl & { supportedValuesOf(key: string): string[] }).supportedValuesOf("currency");
  if (!supported.includes(value)) throw new Error("请选择有效的货币代码");
  return value;
}

export type ConfirmationCommissionInput = {
  mode: ConfirmationCommissionMode;
  scope: ConfirmationCommissionScope;
  currency: string;
  gmvCurrency: string;
  /** Caller must supply effective GMV after refunds, invalid orders and unique ownership validation. */
  effectiveGmv: unknown;
  ratePercent?: unknown;
  thresholdAmount?: unknown;
  thresholdCurrency?: string;
  verifiedEligibleGmv?: unknown;
  eligibleGmvVerified?: boolean;
  overrideRatePercent?: unknown;
  overrideRateConfirmed?: boolean;
};

export function calculateConfirmationCommission(input: ConfirmationCommissionInput) {
  if (!["GMV_SERVICE", "PACKAGE"].includes(input.mode)) throw new Error("不支持的佣金收费模式");
  if (!["ALL", "CAMPAIGN", "PUBLISHER", "EXCESS"].includes(input.scope)) throw new Error("不支持的计佣范围");
  const currency = assertConfirmationCurrency(input.currency);
  if (assertConfirmationCurrency(input.gmvCurrency) !== currency) throw new Error("GMV与计佣币种不一致，必须先确认换算结果");
  const effectiveGmv = parseConfirmationAmount(input.effectiveGmv, "有效GMV");
  let eligibleGmv = effectiveGmv;
  if (input.scope === "EXCESS") {
    if (!input.thresholdCurrency || assertConfirmationCurrency(input.thresholdCurrency) !== currency) {
      throw new Error("门槛与GMV币种必须一致，不能直接跨币种扣减");
    }
    eligibleGmv = Math.max(effectiveGmv - parseConfirmationAmount(input.thresholdAmount, "月度门槛"), 0);
  } else if (input.scope === "CAMPAIGN" || input.scope === "PUBLISHER") {
    if (input.eligibleGmvVerified !== true) throw new Error("必须先核定可计佣GMV及归属证据，不能直接使用总GMV");
    eligibleGmv = parseConfirmationAmount(input.verifiedEligibleGmv, "已核定可计佣GMV");
    if (eligibleGmv > effectiveGmv) throw new Error("可计佣GMV不能超过有效GMV");
  }
  if (input.mode === "PACKAGE" && input.overrideRateConfirmed !== true) {
    throw new Error("总包佣金需在本期对账核定实际抽佣比例，不能使用合同总包值直接计算");
  }
  const ratePercent = parseConfirmationPercent(input.mode === "PACKAGE" ? input.overrideRatePercent : input.ratePercent);
  const commissionAmount = eligibleGmv * (ratePercent / 100);
  if (!Number.isFinite(commissionAmount)) throw new Error("佣金计算结果超出安全范围");
  // No implicit two-decimal rounding: accounting/display layers must apply agreed currency precision.
  return { currency, eligibleGmv, ratePercent, commissionAmount };
}

const DAY_MS = 86_400_000;
export const MAX_CONFIRMATION_PERIOD_DAYS = 36_600;
export type ConfirmationPeriod = {
  confirmationId: string;
  kind: "FIXED_FEE" | "COMMISSION";
  index: number;
  startDate: string;
  endDate: string;
  automationKey: string;
};

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("确认书日期必须使用YYYY-MM-DD格式");
  const stamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) throw new Error("确认书日期无效");
  return stamp;
}

/** Inclusive 30-day fees and calendar-month commission, matching existing schedule conventions.
 * Does not create termination tail commissions: those require separate attribution verification.
 * Freeze effective dates after activation; changes require an explicit adjustment workflow.
 */
export function buildConfirmationPeriods(input: {
  confirmationId: string;
  startDate: string;
  endDate: string;
  fixedFeeEnabled: boolean;
  commissionEnabled: boolean;
}): ConfirmationPeriod[] {
  if (!input.confirmationId || input.confirmationId.trim() !== input.confirmationId) throw new Error("缺少有效项目确认书标识");
  if (typeof input.fixedFeeEnabled !== "boolean" || typeof input.commissionEnabled !== "boolean") throw new Error("必须明确选择启用的收费项目");
  const first = parseDate(input.startDate);
  const last = parseDate(input.endDate);
  if (last < first) throw new Error("确认书结束日期不能早于开始日期");
  if ((last - first) / DAY_MS + 1 > MAX_CONFIRMATION_PERIOD_DAYS) throw new Error("确认书合作周期过长，请核对日期");
  const result: ConfirmationPeriod[] = [];
  const kinds: ConfirmationPeriod["kind"][] = [];
  if (input.fixedFeeEnabled) kinds.push("FIXED_FEE");
  if (input.commissionEnabled) kinds.push("COMMISSION");
  for (const kind of kinds) {
    let index = 1;
    for (let start = first; start <= last; index++) {
      const date = new Date(start);
      const monthEnd = new Date(start);
      monthEnd.setUTCMonth(date.getUTCMonth() + 1, 0);
      const end = Math.min(last, kind === "FIXED_FEE" ? start + 29 * DAY_MS : monthEnd.getTime());
      const startDate = date.toISOString().slice(0, 10);
      const endDate = new Date(end).toISOString().slice(0, 10);
      result.push({ confirmationId: input.confirmationId, kind, index, startDate, endDate,
        automationKey: `confirmation:${encodeURIComponent(input.confirmationId)}:${kind}:${startDate}:${endDate}` });
      start = end + DAY_MS;
    }
  }
  return result;
}
