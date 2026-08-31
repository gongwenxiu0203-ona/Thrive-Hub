import { z } from "zod";
import { parseDateOnlyUtc } from "./dateRange";
import { assertConfirmationCurrency } from "./contractConfirmationRules";

// These inputs belong to the new confirmation workflow only. Never reinterpret
// legacy Contract.commissionType/commissionRate through this schema.
const text = (max = 200) => z.string().trim().max(max);
const requiredText = (label: string, max = 200) => text(max).min(1, `${label}不能为空`);
const amount = z.number().finite("金额必须是有限数字").nonnegative("金额不能小于0").max(1e12);
const percentage = z.number().finite().min(0).max(100);
const currency = z.string().trim().toUpperCase().refine((value) => {
  try { assertConfirmationCurrency(value); return true; } catch { return false; }
}, "请选择有效货币代码");
const date = z.string().refine((value) => parseDateOnlyUtc(value) !== null, "日期格式或日期无效");
const optionalHttpUrl = z.string().trim().max(2000).refine((value) => {
  if (!value) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}, "请输入有效的http/https链接");

/** Standard and user-created dropdown values share a canonical duplicate key. */
export function confirmationOptionKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

const selections = z.array(requiredText("选项", 120)).max(50).superRefine((values, ctx) => {
  const keys = values.map(confirmationOptionKey);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "选项不能重复" });
});

export const confirmationScopeSchema = z.object({
  country: requiredText("国家（站点）", 120),
  salesPlatforms: selections.refine((values) => values.length > 0, "请选择销售平台"),
  programs: selections.refine((values) => values.length > 0, "请选择使用 Program"),
  thirdPartyPlatforms: selections.refine((values) => values.length > 0, "请选择第三方平台，无则选择无"),
}).strict();

const contact = z.object({
  name: text(100), email: z.union([z.literal(""), z.string().trim().email()]), phone: text(80),
}).strict();

export const confirmationDraftSchema = z.object({
  contractId: requiredText("主合同ID", 100),
  title: text(), // Compatibility snapshot label; new records use their server-generated number.
  brand: text(),
  storeUrl: optionalHttpUrl,
  startDate: date.nullable(),
  endDate: date.nullable(),
  minimumMonths: z.number().int().min(0).max(120).nullable(),
  partyAContact: contact,
  partyBContact: contact,
  receivingAccountIds: z.array(requiredText("收款账户ID", 100)).max(20),
  scopes: z.array(confirmationScopeSchema).max(100),
  productScope: z.enum(["ALL", "SPECIFIED"]),
  products: z.array(z.object({
    name: requiredText("商品名称"), asinOrUrl: requiredText("ASIN/商品链接", 2000),
    country: requiredText("商品站点", 120), note: text(2000),
  }).strict()).max(1000),
  serviceDescription: text(10000),
  monthlyFee: z.object({ amount, currency }).strict().nullable(),
  commission: z.object({
    mode: z.enum(["GMV_SERVICE", "PACKAGE"]),
    currency,
    // PACKAGE is a commercial description, not an inferred collection rate.
    packageValue: text(200).nullable(),
    serviceRatePercent: percentage.nullable(),
    basis: z.enum(["ALL", "CAMPAIGN", "PUBLISHER", "EXCESS"]),
    threshold: amount.nullable(),
    thresholdCurrency: currency.nullable(),
    basisEvidence: text(10000),
  }).strict().nullable(),
  additionalFees: z.array(z.object({
    kind: z.enum(["FIXED_PROJECT", "OTHER"]), description: requiredText("费用说明", 2000),
    amount, currency, paymentTerms: requiredText("付款安排", 2000),
  }).strict()).max(30),
  attributionWindowDays: z.number().int().min(0).max(365),
  orderLockDays: z.number().int().min(0).max(365),
  tailDays: z.number().int().min(0).max(365),
  tailTerms: text(5000),
  salesSources: selections,
  taxBasis: z.enum(["EXCLUSIVE", "INCLUSIVE"]),
  paymentTerms: text(5000),
  note: text(10000),
}).strict().superRefine((draft, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
    issue("endDate", "结束日期不能早于开始日期");
  }
  if (new Set(draft.receivingAccountIds).size !== draft.receivingAccountIds.length) {
    issue("receivingAccountIds", "收款账户不能重复");
  }
  const c = draft.commission;
  if (c?.mode === "PACKAGE" && c.serviceRatePercent !== null) {
    issue("commission", "总包佣金的本期实际抽佣比例应在客户对账时确认");
  }
  if (c?.mode === "GMV_SERVICE" && c.packageValue !== null) {
    issue("commission", "GMV服务佣金不能同时填写总包佣金");
  }
  if (c?.basis === "EXCESS" && c.thresholdCurrency && c.thresholdCurrency !== c.currency) {
    issue("commission", "门槛与计佣GMV币种必须一致；不能静默换算");
  }
});

export type ContractConfirmationDraft = z.infer<typeof confirmationDraftSchema>;

/** A syntactically valid draft may be incomplete; effectiveness may not. */
export function parseEffectiveConfirmation(input: unknown): ContractConfirmationDraft {
  const draft = confirmationDraftSchema.parse(input);
  const issues: z.ZodIssue[] = [];
  const require = (ok: unknown, path: string, message: string) => {
    if (!ok) issues.push({ code: "custom", path: [path], message });
  };
  require(draft.startDate && draft.endDate, "startDate", "生效前请填写合作起止日期");
  require(draft.brand, "brand", "生效前请填写品牌/店铺名称");
  require(draft.receivingAccountIds.length, "receivingAccountIds", "生效前至少选择一个乙方收款账户");
  require(draft.scopes.length, "scopes", "生效前请填写推广范围");
  require(draft.partyAContact.name && draft.partyAContact.email, "partyAContact", "请填写甲方对接人和邮箱");
  require(draft.partyBContact.name && draft.partyBContact.email, "partyBContact", "请填写乙方对接人和邮箱");
  require(draft.productScope !== "SPECIFIED" || draft.products.length, "products", "指定商品时请填写商品清单");
  require(draft.monthlyFee || draft.commission || draft.additionalFees.length, "monthlyFee", "至少选择一项收费项目");
  if (draft.commission) {
    const c = draft.commission;
    require(draft.salesSources.length, "salesSources", "请确认销售数据来源");
    require(c.mode !== "GMV_SERVICE" || c.serviceRatePercent !== null, "commission", "请填写GMV服务佣金比例");
    require(c.mode !== "PACKAGE" || c.packageValue, "commission", "请填写总包佣金");
    require(c.basis !== "EXCESS" || (c.threshold !== null && c.thresholdCurrency === c.currency), "commission", "请填写同币种月度销售额门槛");
    require(!["CAMPAIGN", "PUBLISHER"].includes(c.basis) || c.basisEvidence, "commission", "请填写双方确认的存量/增量规则及清单依据");
  }
  if (issues.length) throw new z.ZodError(issues);
  return draft;
}

/** Snapshot is versioned; future schema readers must never silently reinterpret it. */
export function confirmationDraftSnapshot(input: unknown): string {
  return JSON.stringify({ schemaVersion: 1, data: confirmationDraftSchema.parse(input) });
}
