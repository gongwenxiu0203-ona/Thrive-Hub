"use server";

import { Prisma } from "@prisma/client";
import { deletedInvoiceNumber, releaseDeletedInvoiceNumber } from "@/lib/businessNumberRelease";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  customerScope,
  financeDataView,
  financeReferenceCustomerScope,
  isStaff,
  reconciliationScope,
} from "@/lib/dataScope";
import type { PermLevel } from "@/lib/featurePermissions";
import {
  INVOICE_BANK_ACCOUNTS,
  invoiceBankAccountForKey,
  normalizeInvoiceBankKey,
  type InvoiceBankAccount,
} from "@/lib/invoiceBankAccounts";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";
import { actionError } from "@/lib/appError";
import { writeAdminAudit } from "@/lib/adminObservability";
import { confirmationSubmissionIssue } from "@/lib/reconciliationConfirmation";

const INVOICE_FEATURE = "finance.invoices";
const INVOICE_STATUSES = ["DRAFT", "ISSUED", "VOID"] as const;
const PERIOD_TYPES = ["MONTH", "DATE_RANGE"] as const;
const FEE_TYPES = ["MONTHLY_FEE", "SALES_COMMISSION", "AFFILIATE_FEE"] as const;
const MAX_INVOICE_AMOUNT = 1_000_000_000;
const MAX_LINE_ITEMS = 100;

type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
type InvoicePeriodType = (typeof PERIOD_TYPES)[number];
type InvoiceFeeType = (typeof FEE_TYPES)[number];
type InvoiceSummaryFeeType = InvoiceFeeType | "MIXED";

export type InvoiceItemInput = {
  projectConfirmationId?: string | null;
  feeType: InvoiceFeeType;
  currency: string;
  periodType: InvoicePeriodType;
  periodLabel: string;
  description: string;
  promoPlatform?: string | null;
  targetSite?: string | null;
  affiliatePlatform?: string | null;
  quantity: number;
  unitPrice: number;
  sortOrder?: number;
};

export type InvoiceDraftInput = {
  billingRequestId?: string | null;
  customerId: string;
  contractId: string;
  contractIds: string[];
  accountsReceivableId?: string | null;
  invoiceDate: string;
  dueDate: string;
  periodType: InvoicePeriodType;
  periodLabel: string;
  clientName?: string | null;
  clientAddress?: string | null;
  currency: string;
  bankAccountKey?: string | null;
  bankSnapshot?: Partial<InvoiceBankAccount> | null;
  terms?: string | null;
  status?: "DRAFT" | "ISSUED";
  items: InvoiceItemInput[];
  reconciliationIds?: string[];
};

export type InvoiceListItem = {
  id: string;
  invoiceNo: string;
  customerId: string | null;
  customerName: string;
  contractId: string | null;
  contractNo: string | null;
  invoiceDate: string;
  dueDate: string;
  periodLabel: string;
  feeType: InvoiceSummaryFeeType;
  currency: string;
  totalAmount: number;
  currencyTotals: Array<{ currency: string; amount: number }>;
  status: InvoiceStatus;
  createdByName: string | null;
  createdAt: string;
  documentType: string;
  originalFileUrl: string | null;
  archiveOnly: boolean;
  accountsReceivableId: string | null;
};

export type InvoiceDetail = {
  billingRequestId?: string | null;
  id: string;
  invoiceNo: string;
  customerId: string | null;
  contractId: string | null;
  contractIds: string[];
  accountsReceivableId: string | null;
  invoiceDate: string;
  dueDate: string;
  periodType: InvoicePeriodType;
  periodLabel: string;
  feeType: InvoiceSummaryFeeType;
  clientName: string;
  clientAddress: string | null;
  currency: string;
  totalAmount: number;
  currencyTotals: Array<{ currency: string; amount: number }>;
  bankAccountKey: string | null;
  bankSnapshot: Partial<InvoiceBankAccount>;
  terms: string | null;
  status: InvoiceStatus;
  pdfUrl: string | null;
  originalFileUrl: string | null;
  archiveOnly: boolean;
  archiveSource: string;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<InvoiceItemInput & { id: string; amount: number }>;
  reconciliationIds?: string[];
};

export type InvoiceFormOptions = {
  customers: Array<{ id: string; brandName: string }>;
  contracts: Array<{
    id: string;
    customerId: string;
    contractNo: string;
    partyACompany: string;
    address: string;
    platforms: string[];
    targetSites: string[];
    affiliatePlatforms: string[];
    bankAccounts: InvoiceBankAccount[];
  }>;
  accountsReceivables: Array<{
    id: string;
    customerId: string;
    contractId?: string;
    label: string;
    amount: number;
    currency: string;
  }>;
  bankAccounts: InvoiceBankAccount[];
};

export type InvoiceReconciliationPrefillResult =
  | { ok: true; invoice: InvoiceDetail | null; existingInvoiceId?: string }
  | { ok: false; error: string };

const RECONCILIATION_FEATURE = "finance.customer_reconciliation";
const MAX_RECONCILIATION_PREFILL_ITEMS = 100;

export type InvoiceSaveResult = {
  ok: boolean;
  error?: string;
  id?: string;
  invoiceNo?: string;
};

async function requireInvoicePermission(required: PermLevel) {
  const session = await requireSession();
  if (!isStaff(session.role)) {
    throw new Error("仅内部员工可以访问 Invoice");
  }
  await requireFeaturePermission(session, INVOICE_FEATURE, required);
  return session;
}

function cleanNullable(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

function parseDate(value: string, label: string): Date {
  const clean = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw new Error(`${label}格式不正确`);
  }
  const date = new Date(`${clean}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== clean
  ) {
    throw new Error(`${label}格式不正确`);
  }
  return date;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function ensureAccountsReceivableForIssuedInvoice(
  tx: Prisma.TransactionClient,
  invoice: {
    id: string;
    invoiceNo: string;
    customerId: string | null;
    invoiceDate: Date;
    dueDate: Date;
    totalAmount: number;
    currency: string;
    accountsReceivableId: string | null;
  },
) {
  if (invoice.accountsReceivableId) return invoice.accountsReceivableId;
  if (invoice.currency === "MIXED") {
    throw new Error("混合币种票据不能自动创建单一应收账款，请拆分开票。");
  }
  const normalizedCurrency = invoice.currency === "CNY" ? "RMB" : invoice.currency;
  const exchangeRate = normalizedCurrency === "USD" ? 7.2 : 1;
  const amountRmb = roundMoney(invoice.totalAmount * exchangeRate);
  const existing = await tx.accountsReceivable.findUnique({ where: { invoiceNo: invoice.invoiceNo } });
  if (existing) {
    if (
      existing.customerId !== invoice.customerId ||
      existing.currency !== normalizedCurrency ||
      Math.abs(existing.invoiceAmount - invoice.totalAmount) > 0.01
    ) {
      throw new Error("同号应收账款与当前票据金额、币种或客户不一致，请财务核查。");
    }
    await tx.invoice.update({ where: { id: invoice.id }, data: { accountsReceivableId: existing.id } });
    return existing.id;
  }
  const now = new Date();
  const overdue = invoice.dueDate < now;
  const ar = await tx.accountsReceivable.create({
    data: {
      customerId: invoice.customerId,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      invoiceAmount: invoice.totalAmount,
      currency: normalizedCurrency,
      exchangeRate,
      amountRmb,
      dueDate: invoice.dueDate,
      status: overdue ? "OVERDUE" : "NOT_DUE",
      riskLevel: overdue ? "YELLOW" : "GREEN",
    },
  });
  await tx.invoice.update({ where: { id: invoice.id }, data: { accountsReceivableId: ar.id } });
  return ar.id;
}

async function refreshBillingRequestStatus(tx: Prisma.TransactionClient, billingRequestId: string | null) {
  if (!billingRequestId) return;
  const request = await tx.billingRequest.findUnique({
    where: { id: billingRequestId },
    select: { requestedAmount: true, invoices: { where: { deletedAt: null, status: "ISSUED" }, select: { totalAmount: true } } },
  });
  if (!request) return;
  const issuedAmount = roundMoney(request.invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0));
  await tx.billingRequest.update({
    where: { id: billingRequestId },
    data: issuedAmount + 0.01 >= request.requestedAmount
      ? { status: "COMPLETED", completedAt: new Date() }
      : { status: "PROCESSING", completedAt: null },
  });
}

function parseStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  } catch {
    // Legacy contract fields are often comma-separated instead of JSON.
  }
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBankSnapshot(value: string): Partial<InvoiceBankAccount> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Partial<InvoiceBankAccount>)
      : {};
  } catch {
    return {};
  }
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3,4}$/.test(currency)) {
    throw new Error("币种格式不正确");
  }
  return currency === "RMB" ? "CNY" : currency;
}
function normalizeItemPeriod(
  periodType: InvoicePeriodType,
  rawLabel: string,
  lineNumber: number,
): string {
  if (!PERIOD_TYPES.includes(periodType)) {
    throw new Error(`第 ${lineNumber} 行费用期间类型不正确`);
  }
  const periodLabel = rawLabel.trim();
  if (!periodLabel || periodLabel.length > 120) {
    throw new Error(`第 ${lineNumber} 行费用期间必填且不能超过 120 个字符`);
  }
  if (periodType === "MONTH") {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodLabel)) {
      throw new Error(`第 ${lineNumber} 行月份格式应为 YYYY-MM`);
    }
    return periodLabel;
  }
  const match = periodLabel.match(
    /^(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})$/,
  );
  if (!match) {
    throw new Error(
      `第 ${lineNumber} 行日期范围格式应为 YYYY-MM-DD ~ YYYY-MM-DD`,
    );
  }
  const start = parseDate(match[1], `第 ${lineNumber} 行开始日期`);
  const end = parseDate(match[2], `第 ${lineNumber} 行结束日期`);
  if (end < start) {
    throw new Error(`第 ${lineNumber} 行费用期间结束日期不能早于开始日期`);
  }
  return `${match[1]} ~ ${match[2]}`;
}

function summarizeCurrencyTotals(
  items: Array<{ currency: string; amount: number }>,
): Array<{ currency: string; amount: number }> {
  const totals = new Map<string, number>();
  for (const item of items) {
    const currency = normalizeCurrency(item.currency);
    totals.set(currency, roundMoney((totals.get(currency) ?? 0) + item.amount));
  }
  return Array.from(totals, ([currency, amount]) => ({ currency, amount }));
}

function normalizeItems(items: InvoiceItemInput[]) {
  if (items.length > MAX_LINE_ITEMS) {
    throw new Error(`单张 Invoice 最多 ${MAX_LINE_ITEMS} 行项目`);
  }
  return items.map((item, index) => {
    if (!FEE_TYPES.includes(item.feeType)) {
      throw new Error(`第 ${index + 1} 行费用类型不正确`);
    }
    const description = item.description.trim();
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!description) throw new Error(`第 ${index + 1} 行缺少项目描述`);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`第 ${index + 1} 行数量必须大于 0`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`第 ${index + 1} 行单价不能小于 0`);
    }
    const amount = quantity * unitPrice;
    if (!Number.isFinite(amount) || amount > MAX_INVOICE_AMOUNT) {
      throw new Error(`第 ${index + 1} 行金额超出允许范围`);
    }
    return {
      projectConfirmationId: cleanNullable(item.projectConfirmationId),
      feeType: item.feeType,
      currency: normalizeCurrency(item.currency),
      periodType: item.periodType,
      periodLabel: normalizeItemPeriod(
        item.periodType,
        item.periodLabel,
        index + 1,
      ),
      description,
      promoPlatform: cleanNullable(item.promoPlatform),
      targetSite: cleanNullable(item.targetSite),
      affiliatePlatform: cleanNullable(item.affiliatePlatform),
      quantity,
      unitPrice: roundMoney(unitPrice),
      amount: roundMoney(amount),
      sortOrder: Number.isInteger(item.sortOrder)
        ? Number(item.sortOrder)
        : index,
    };
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof FeaturePermissionError) {
    return "当前账号没有执行此 Invoice 操作的权限";
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    const publicBusinessError = [
      /仅内部员工可以访问 Invoice/,
      /格式不正确/,
      /币种/,
      /第 \d+ 行/,
      /单张 Invoice 最多/,
      /关联合同/,
      /主合同/,
      /应收账款/,
      /请选择关联客户/,
      /账期类型/,
      /付款截止日/,
      /合计金额超出允许范围/,
      /费用期间/,
      /正式开具前/,
      /客户名称不能为空/,
      /对账记录/,
      /Invoice 状态已变更/,
    ].some((pattern) => pattern.test(message));
    if (publicBusinessError) return message;
  }
  return actionError(error, "invoice.action").error;
}

async function validateRelations(
  session: Awaited<ReturnType<typeof requireInvoicePermission>>,
  customerId: string,
  contractIds: string[],
  accountsReceivableId?: string | null,
  expectedCurrency?: string,
) {
  const referenceCustomerScope = financeReferenceCustomerScope(session);
  const contracts = await prisma.contract.findMany({
    where: {
      id: { in: contractIds },
      customerId,
      deletedAt: null,
      customer: {
        id: customerId,
        deletedAt: null,
        ...referenceCustomerScope,
      },
    },
    select: {
      id: true,
      customerId: true,
      partyA: true,
      partyAAddress: true,
      partyBBankAccounts: true,
      customer: { select: { brandName: true } },
    },
  });
  if (contracts.length !== contractIds.length) {
    throw new Error("部分关联合同不存在、已删除或不属于所选客户");
  }
  const contractMap = new Map(
    contracts.map((contract) => [contract.id, contract]),
  );
  const contract = contractMap.get(contractIds[0]);
  if (!contract) throw new Error("请选择有效的主合同");

  if (accountsReceivableId) {
    const receivable = await prisma.accountsReceivable.findFirst({
      where: {
        id: accountsReceivableId,
        customerId,
        customer: {
          deletedAt: null,
          ...financeReferenceCustomerScope(session),
        },
      },
      select: { id: true, currency: true },
    });
    if (!receivable) throw new Error("应收账款不存在或不属于所选客户");
    if (
      expectedCurrency &&
      normalizeCurrency(receivable.currency) !== expectedCurrency
    ) {
      throw new Error("所选应收账款币种与 Invoice 项目币种不一致");
    }
  }
  return contract;
}

function invoicePrefix(invoiceDate: Date): string {
  return isoDate(invoiceDate).replaceAll("-", "");
}

async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  invoiceDate: Date,
): Promise<string> {
  const prefix = invoicePrefix(invoiceDate);
  const existing = await tx.invoice.findMany({
    where: { invoiceNo: { startsWith: prefix }, deletedAt: null },
    select: { invoiceNo: true },
  });
  let max = 0;
  for (const { invoiceNo } of existing) {
    const suffix = Number.parseInt(invoiceNo.slice(prefix.length), 10);
    if (Number.isInteger(suffix) && suffix > max) max = suffix;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

async function normalizedDraft(
  session: Awaited<ReturnType<typeof requireInvoicePermission>>,
  input: InvoiceDraftInput,
) {
  if (!input.customerId?.trim()) throw new Error("请选择关联客户");
  const contractIds = Array.from(
    new Set(
      (input.contractIds?.length ? input.contractIds : [input.contractId])
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (!contractIds.length) throw new Error("请选择关联合同");
  if (!PERIOD_TYPES.includes(input.periodType))
    throw new Error("账期类型不正确");

  const invoiceDate = parseDate(input.invoiceDate, "Invoice 日期");
  const dueDate = parseDate(input.dueDate, "付款截止日");
  if (dueDate < invoiceDate) throw new Error("付款截止日不能早于 Invoice 日期");

  const items = normalizeItems(input.items);
  const currencyTotals = summarizeCurrencyTotals(items);
  if (currencyTotals.some((row) => row.amount > MAX_INVOICE_AMOUNT)) {
    throw new Error("Invoice 单币种合计金额超出允许范围");
  }
  const isMixedCurrency = currencyTotals.length > 1;
  const fallbackCurrency =
    currencyTotals[0]?.currency ??
    normalizeCurrency(input.currency === "MIXED" ? "USD" : input.currency);
  const summaryCurrency = isMixedCurrency
    ? "MIXED"
    : (currencyTotals[0]?.currency ?? fallbackCurrency);
  const requestedReceivableId = cleanNullable(input.accountsReceivableId);
  if (isMixedCurrency && requestedReceivableId) {
    throw new Error(
      "混合币种 Invoice 不能关联单一应收账款，请取消应收账款关联后保存",
    );
  }
  const relation = await validateRelations(
    session,
    input.customerId,
    contractIds,
    requestedReceivableId,
    isMixedCurrency ? undefined : summaryCurrency,
  );
  const feeTypes = new Set(items.map((item) => item.feeType));
  const feeType: InvoiceSummaryFeeType =
    feeTypes.size > 1 ? "MIXED" : (items[0]?.feeType ?? "MONTHLY_FEE");
  const parentPeriodLabel = input.periodLabel.trim();
  if (!parentPeriodLabel || parentPeriodLabel.length > 120) {
    throw new Error("费用期间必填且不能超过 120 个字符");
  }
  const periodKeys = new Set(
    items.map((item) => `${item.periodType}\u0000${item.periodLabel}`),
  );
  const summaryPeriodType: InvoicePeriodType =
    periodKeys.size === 1
      ? items[0].periodType
      : items.length
        ? "DATE_RANGE"
        : input.periodType;
  const summaryPeriodLabel =
    periodKeys.size === 1
      ? items[0].periodLabel
      : items.length
        ? "多个费用期间"
        : parentPeriodLabel;
  if (input.status === "ISSUED" && items.length === 0) {
    throw new Error("正式开具前请至少添加一个收费项目");
  }

  const clientName =
    cleanNullable(input.clientName) ??
    cleanNullable(relation.partyA) ??
    relation.customer?.brandName ??
    "";
  if (!clientName) throw new Error("客户名称不能为空");

  const selectedBankKey = cleanNullable(input.bankAccountKey);
  const catalogueBank = selectedBankKey
    ? invoiceBankAccountForKey(selectedBankKey)
    : null;
  if (selectedBankKey && !catalogueBank) {
    throw new Error("所选收款账户不存在或已停用");
  }
  // Persist only a trusted catalogue snapshot. Client-provided bank details
  // must never be able to replace beneficiary or account numbers.
  const bankSnapshot: Partial<InvoiceBankAccount> = catalogueBank ?? {};
  if (input.status === "ISSUED" && !cleanNullable(bankSnapshot.accountNo)) {
    throw new Error("正式开具前请选择有效收款账户");
  }

  return {
    customerId: input.customerId,
    contractId: contractIds[0],
    contractLinks: contractIds.map((contractId, sortOrder) => ({
      contractId,
      sortOrder,
    })),
    accountsReceivableId: isMixedCurrency ? null : requestedReceivableId,
    invoiceDate,
    dueDate,
    periodType: summaryPeriodType,
    periodLabel: summaryPeriodLabel,
    feeType,
    clientName,
    clientAddress:
      cleanNullable(input.clientAddress) ??
      cleanNullable(relation.partyAAddress),
    currency: summaryCurrency,
    bankAccountKey: selectedBankKey
      ? normalizeInvoiceBankKey(selectedBankKey)
      : null,
    bankSnapshot: JSON.stringify(bankSnapshot),
    terms: cleanNullable(input.terms),
    status: input.status ?? "DRAFT",
    items,
    totalAmount: isMixedCurrency ? 0 : (currencyTotals[0]?.amount ?? 0),
  };
}

function invoiceScope(
  session: Awaited<ReturnType<typeof requireInvoicePermission>>,
): Prisma.InvoiceWhereInput {
  return isStaff(session.role) ? {} : { id: "__NO_ACCESS__" };
}

export async function getInvoiceFormOptions(
  includeAllFinanceReferences = false,
): Promise<InvoiceFormOptions> {
  const session = await requireInvoicePermission(
    includeAllFinanceReferences ? "EDIT" : "READ",
  );
  const referenceCustomerScope = financeReferenceCustomerScope(session);
  const receivableCustomerScope = financeReferenceCustomerScope(session);
  const [customers, contracts, accountsReceivables] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null, ...referenceCustomerScope },
      orderBy: { brandName: "asc" },
      select: { id: true, brandName: true },
    }),
    prisma.contract.findMany({
      where: {
        deletedAt: null,
        customerId: { not: null },
        customer: { deletedAt: null, ...referenceCustomerScope },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        customerId: true,
        contractNo: true,
        partyA: true,
        partyAAddress: true,
        promoPlatform: true,
        targetSite: true,
        coopChannels: true,
        partyBBankAccounts: true,
      },
    }),
    prisma.accountsReceivable.findMany({
      where: {
        customerId: { not: null },
        customer: { deletedAt: null, ...receivableCustomerScope },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        customerId: true,
        invoiceNo: true,
        invoiceAmount: true,
        currency: true,
      },
    }),
  ]);

  return {
    customers,
    contracts: contracts.flatMap((contract) => {
      if (!contract.customerId) return [];
      const keys = parseStringList(contract.partyBBankAccounts);
      const bankAccounts = keys
        .map(invoiceBankAccountForKey)
        .filter((bank): bank is InvoiceBankAccount => Boolean(bank));
      return [
        {
          id: contract.id,
          customerId: contract.customerId,
          contractNo: contract.contractNo,
          partyACompany: contract.partyA ?? "",
          address: contract.partyAAddress ?? "",
          platforms: parseStringList(contract.promoPlatform),
          targetSites: parseStringList(contract.targetSite),
          affiliatePlatforms: parseStringList(contract.coopChannels),
          bankAccounts,
        },
      ];
    }),
    accountsReceivables: accountsReceivables.flatMap((row) =>
      row.customerId
        ? [
            {
              id: row.id,
              customerId: row.customerId,
              label: row.invoiceNo,
              amount: row.invoiceAmount,
              currency: row.currency,
            },
          ]
        : [],
    ),
    bankAccounts: Object.values(INVOICE_BANK_ACCOUNTS),
  };
}

function reconciliationCurrency(value: string): string {
  const clean = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    人民币: "CNY",
    人民币元: "CNY",
    "¥": "CNY",
    RMB: "CNY",
    CNY: "CNY",
    美金: "USD",
    美元: "USD",
    $: "USD",
    USD: "USD",
  };
  const normalized = aliases[clean] ?? clean;
  try {
    return normalizeCurrency(normalized);
  } catch {
    throw new Error(
      `对账记录中的币种“${value || "未填写"}”无法用于 Invoice，请先修正币种`,
    );
  }
}

function reconciliationPeriod(start: Date, end: Date): {
  periodType: InvoicePeriodType;
  periodLabel: string;
} {
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth();
  const isSameMonth =
    startYear === end.getUTCFullYear() && startMonth === end.getUTCMonth();
  const lastDayOfMonth = new Date(
    Date.UTC(startYear, startMonth + 1, 0),
  ).getUTCDate();
  const isCompleteCalendarMonth =
    isSameMonth && start.getUTCDate() === 1 && end.getUTCDate() === lastDayOfMonth;

  return isCompleteCalendarMonth
    ? { periodType: "MONTH", periodLabel: isoDate(start).slice(0, 7) }
    : {
        periodType: "DATE_RANGE",
        periodLabel: `${isoDate(start)} ~ ${isoDate(end)}`,
      };
}

export async function getInvoiceReconciliationPrefill(
  reconciliationIds: string[],
  _requestedScope?: string | null,
): Promise<InvoiceReconciliationPrefillResult> {
  try {
    const session = await requireInvoicePermission("EDIT");
    try {
      await requireFeaturePermission(
        session,
        RECONCILIATION_FEATURE,
        "READ",
      );
    } catch {
      return {
        ok: false,
        error: "缺少客户对账查看权限，无法从对账记录预填 Invoice",
      };
    }

    const ids = Array.from(
      new Set(reconciliationIds.map((id) => id.trim()).filter(Boolean)),
    );
    if (!ids.length) {
      return { ok: false, error: "未选择要开具 Invoice 的对账记录" };
    }
    if (ids.length > MAX_RECONCILIATION_PREFILL_ITEMS) {
      return {
        ok: false,
        error: `单次最多选择 ${MAX_RECONCILIATION_PREFILL_ITEMS} 条对账记录开具 Invoice`,
      };
    }

    const dataView = financeDataView(session);
    const rows = await prisma.customerReconciliation.findMany({
      where: {
        AND: [
          { id: { in: ids }, deletedAt: null },
          reconciliationScope(session, dataView),
          {
            customer: {
              deletedAt: null,
              ...customerScope(session, dataView),
            },
          },
          { contract: { deletedAt: null } },
        ],
      },
      orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        customerId: true,
        contractId: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        reconcileType: true,
        feeAmount: true,
        fixedFeeCurrency: true,
        commissionAmount: true,
        commissionCurrency: true,
        finalCommissionAmount: true,
        finalFeeAmount: true,
        projectConfirmationId: true,
        ruleSnapshot: true,
        confirmedCommissionRate: true,
        invoiceLinks: {
          select: {
            invoice: {
              select: { id: true, status: true, deletedAt: true },
            },
          },
        },
        customer: { select: { brandName: true } },
        contract: {
          select: {
            partyA: true,
            partyAAddress: true,
            partyBBankAccounts: true,
          },
        },
      },
    });

    if (rows.length !== ids.length) {
      return {
        ok: false,
        error:
          "部分对账记录不存在、已删除、关联客户或合同已失效，或不在你的数据范围内",
      };
    }
    if (rows.some((row) => row.status !== "CONFIRMED")) {
      return {
        ok: false,
        error: "只有状态为“已确认”的对账记录可以开具 Invoice",
      };
    }
    const confirmationIssue = rows
      .map((row) => confirmationSubmissionIssue(row))
      .find((issue): issue is string => Boolean(issue));
    if (confirmationIssue) return { ok: false, error: confirmationIssue };
    if (
      rows.some(
        (row) => !["FEE_ONLY", "COMMISSION_ONLY"].includes(row.reconcileType),
      )
    ) {
      return {
        ok: false,
        error: "历史固费与销售佣金合并对账不能自动开具 Invoice，请先拆分对账",
      };
    }
    const customerId = rows[0].customerId;
    if (rows.some((row) => row.customerId !== customerId)) {
      return { ok: false, error: "一次只能为同一客户的对账记录开具 Invoice" };
    }

    const activeLinkedInvoices = rows.map(
      (row) =>
        row.invoiceLinks
          .map((link) => link.invoice)
          .find(
            (invoice) =>
              invoice.deletedAt === null && invoice.status !== "VOID",
          ) ?? null,
    );
    const activeLinkedIds = Array.from(
      new Set(
        activeLinkedInvoices
          .filter((invoice): invoice is NonNullable<typeof invoice> =>
            Boolean(invoice),
          )
          .map((invoice) => invoice.id),
      ),
    );
    if (
      activeLinkedIds.length === 1 &&
      activeLinkedInvoices.every(
        (invoice) =>
          invoice?.id === activeLinkedIds[0] && invoice.status === "DRAFT",
      )
    ) {
      return { ok: true, invoice: null, existingInvoiceId: activeLinkedIds[0] };
    }
    if (activeLinkedIds.length > 0) {
      return {
        ok: false,
        error:
          activeLinkedIds.length > 1
            ? "所选对账记录已关联不同 Invoice，请分别打开处理"
            : "部分对账记录已有 Invoice，不能与未开票记录重复合并，请分别处理",
      };
    }

    const currencies = rows.map((row) =>
      reconciliationCurrency(
        row.reconcileType === "FEE_ONLY"
          ? row.fixedFeeCurrency
          : row.commissionCurrency,
      ),
    );

    const items = rows.map((row, index) => {
      const period = reconciliationPeriod(row.periodStart, row.periodEnd);
      const currency = currencies[index];
      const isFixedFee = row.reconcileType === "FEE_ONLY";
      const amount = isFixedFee
        ? (row.finalFeeAmount ?? row.feeAmount)
        : (row.finalCommissionAmount ?? row.commissionAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(
          `${isFixedFee ? "月度服务费" : "销售佣金"}（${period.periodLabel}）的待支付金额必须大于 0，暂不能开具 Invoice`,
        );
      }
      return {
        id: `reconciliation-${row.id}`,
        projectConfirmationId: row.projectConfirmationId,
        feeType: isFixedFee
          ? ("MONTHLY_FEE" as const)
          : ("SALES_COMMISSION" as const),
        currency,
        periodType: period.periodType,
        periodLabel: period.periodLabel,
        description: isFixedFee ? "月度服务费" : "销售佣金",
        promoPlatform: null,
        targetSite: null,
        affiliatePlatform: null,
        quantity: 1,
        unitPrice: amount,
        amount,
        sortOrder: index,
      };
    });

    const contractIds = Array.from(new Set(rows.map((row) => row.contractId)));
    const start = rows.reduce(
      (earliest, row) =>
        row.periodStart < earliest ? row.periodStart : earliest,
      rows[0].periodStart,
    );
    const end = rows.reduce(
      (latest, row) => (row.periodEnd > latest ? row.periodEnd : latest),
      rows[0].periodEnd,
    );
    const primaryContract = rows[0].contract;
    const bankKey =
      parseStringList(primaryContract.partyBBankAccounts).find((key) =>
        Boolean(invoiceBankAccountForKey(key)),
      ) ?? null;
    const bankSnapshot = bankKey
      ? (invoiceBankAccountForKey(bankKey) ?? {})
      : {};
    const today = isoDate(new Date());
    const due = new Date(`${today}T00:00:00`);
    due.setDate(due.getDate() + 15);
    const now = new Date().toISOString();
    const feeTypes = new Set(items.map((item) => item.feeType));
    const currencyTotals = summarizeCurrencyTotals(items);
    const isMixedCurrency = currencyTotals.length > 1;
    const invoicePeriod = reconciliationPeriod(start, end);

    return {
      ok: true,
      invoice: {
        id: "",
        invoiceNo: "",
        customerId,
        contractId: contractIds[0] ?? null,
        contractIds,
        accountsReceivableId: null,
        invoiceDate: today,
        dueDate: isoDate(due),
        periodType: invoicePeriod.periodType,
        periodLabel: invoicePeriod.periodLabel,
        feeType: feeTypes.size > 1 ? "MIXED" : items[0].feeType,
        clientName:
          primaryContract.partyA?.trim() || rows[0].customer.brandName,
        clientAddress: primaryContract.partyAAddress,
        currency: isMixedCurrency ? "MIXED" : currencyTotals[0].currency,
        totalAmount: isMixedCurrency ? 0 : currencyTotals[0].amount,
        currencyTotals,
        bankAccountKey: bankKey,
        bankSnapshot,
        terms: null,
        status: "DRAFT",
        pdfUrl: null,
        originalFileUrl: null,
        archiveOnly: false,
        archiveSource: "SYSTEM",
        createdById: null,
        createdByName: null,
        createdAt: now,
        updatedAt: now,
        items,
        reconciliationIds: ids,
      },
    };
  } catch (error) {
    console.error("[invoice-reconciliation-prefill] failed", error);
    return { ok: false, error: errorMessage(error) };
  }
}

async function validateReconciliationLinksForCreate(
  tx: Prisma.TransactionClient,
  session: Awaited<ReturnType<typeof requireInvoicePermission>>,
  rawIds: string[] | undefined,
  customerId: string,
  contractIds: string[],
): Promise<string[]> {
  const ids = Array.from(
    new Set((rawIds ?? []).map((id) => id.trim()).filter(Boolean)),
  );
  if (!ids.length) return [];
  if (ids.length > MAX_RECONCILIATION_PREFILL_ITEMS) {
    throw new Error(
      "\u5355\u6b21\u5173\u8054\u7684\u5bf9\u8d26\u8bb0\u5f55\u8fc7\u591a",
    );
  }
  try {
    await requireFeaturePermission(session, RECONCILIATION_FEATURE, "READ");
  } catch {
    throw new Error(
      "\u7f3a\u5c11\u5ba2\u6237\u5bf9\u8d26\u67e5\u770b\u6743\u9650\uff0c\u65e0\u6cd5\u5173\u8054 Invoice",
    );
  }
  const rows = await tx.customerReconciliation.findMany({
    where: {
      id: { in: ids },
      customerId,
      contractId: { in: contractIds },
      status: "CONFIRMED",
      deletedAt: null,
    },
    select: {
      id: true,
      projectConfirmationId: true,
      ruleSnapshot: true,
      confirmedCommissionRate: true,
      invoiceLinks: {
        where: {
          invoice: { deletedAt: null, status: { not: "VOID" } },
        },
        select: { invoiceId: true },
      },
    },
  });
  if (rows.length !== ids.length) {
    throw new Error(
      "\u90e8\u5206\u5bf9\u8d26\u8bb0\u5f55\u4e0d\u5b58\u5728\u3001\u672a\u786e\u8ba4\uff0c\u6216\u4e0e\u6240\u9009\u5ba2\u6237\u5408\u540c\u4e0d\u4e00\u81f4",
    );
  }
  const confirmationIssue = rows
    .map((row) => confirmationSubmissionIssue(row))
    .find((issue): issue is string => Boolean(issue));
  if (confirmationIssue) throw new Error(confirmationIssue);
  if (rows.some((row) => row.invoiceLinks.length > 0)) {
    throw new Error(
      "\u90e8\u5206\u5bf9\u8d26\u8bb0\u5f55\u5df2\u5173\u8054 Invoice\uff0c\u8bf7\u6253\u5f00\u5df2\u6709 Invoice \u5904\u7406",
    );
  }
  return ids;
}

export async function listInvoices(input?: {
  search?: string;
  status?: InvoiceStatus | "ALL";
}): Promise<InvoiceListItem[]> {
  const session = await requireInvoicePermission("READ");
  const search = input?.search?.trim();
  const status =
    input?.status &&
    input.status !== "ALL" &&
    INVOICE_STATUSES.includes(input.status)
      ? input.status
      : undefined;
  const rows = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      ...invoiceScope(session),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNo: { contains: search } },
              { clientName: { contains: search } },
              { customer: { brandName: { contains: search } } },
              { contract: { contractNo: { contains: search } } },
              {
                contractLinks: {
                  some: { contract: { contractNo: { contains: search } } },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ invoiceDate: "desc" }, { invoiceNo: "desc" }],
    include: {
      customer: { select: { brandName: true } },
      contract: { select: { contractNo: true } },
      contractLinks: {
        orderBy: { sortOrder: "asc" },
        include: { contract: { select: { contractNo: true } } },
      },
      createdBy: { select: { name: true } },
      items: { select: { currency: true, amount: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    billingRequestId: row.billingRequestId,
    invoiceNo: row.invoiceNo,
    customerId: row.customerId,
    customerName: row.customer?.brandName ?? row.clientName,
    contractId: row.contractId,
    contractNo: row.contractLinks.length
      ? row.contractLinks.map((link) => link.contract.contractNo).join("、")
      : (row.contract?.contractNo ?? null),
    invoiceDate: isoDate(row.invoiceDate),
    dueDate: isoDate(row.dueDate),
    periodLabel: row.periodLabel,
    feeType: row.feeType as InvoiceSummaryFeeType,
    currency: row.currency,
    totalAmount: row.totalAmount,
    status: row.status as InvoiceStatus,
    currencyTotals: summarizeCurrencyTotals(row.items),
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    documentType: row.documentType,
    originalFileUrl: row.originalFileUrl,
    archiveOnly: row.archiveOnly,
    accountsReceivableId: row.accountsReceivableId,
  }));
}

export async function getInvoiceById(
  id: string,
): Promise<InvoiceDetail | null> {
  const session = await requireInvoicePermission("READ");
  const row = await prisma.invoice.findFirst({
    where: { id, deletedAt: null, ...invoiceScope(session) },
    include: {
      createdBy: { select: { name: true } },
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      contractLinks: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    invoiceNo: row.invoiceNo,
    customerId: row.customerId,
    contractId: row.contractId,
    contractIds: row.contractLinks.length
      ? row.contractLinks.map((link) => link.contractId)
      : row.contractId
        ? [row.contractId]
        : [],
    accountsReceivableId: row.accountsReceivableId,
    invoiceDate: isoDate(row.invoiceDate),
    dueDate: isoDate(row.dueDate),
    periodType: row.periodType as InvoicePeriodType,
    periodLabel: row.periodLabel,
    feeType: row.feeType as InvoiceSummaryFeeType,
    clientName: row.clientName,
    clientAddress: row.clientAddress,
    currency: row.currency,
    totalAmount: row.totalAmount,
    bankAccountKey: row.bankAccountKey,
    currencyTotals: summarizeCurrencyTotals(row.items),
    bankSnapshot: parseBankSnapshot(row.bankSnapshot),
    terms: row.terms,
    status: row.status as InvoiceStatus,
    pdfUrl: row.pdfUrl,
    originalFileUrl: row.originalFileUrl,
    archiveOnly: row.archiveOnly,
    archiveSource: row.archiveSource,
    createdById: row.createdById,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      feeType: item.feeType as InvoiceFeeType,
      description: item.description,
      currency: item.currency,
      periodType: item.periodType as InvoicePeriodType,
      periodLabel: item.periodLabel,
      promoPlatform: item.promoPlatform,
      targetSite: item.targetSite,
      affiliatePlatform: item.affiliatePlatform,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      sortOrder: item.sortOrder,
    })),
  };
}

export async function createInvoice(
  input: InvoiceDraftInput,
): Promise<InvoiceSaveResult> {
  try {
    const session = await requireInvoicePermission("EDIT");
    const draft = await normalizedDraft(session, input);
    let lastConflict: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const invoiceNo = await nextInvoiceNumber(tx, draft.invoiceDate);
          const reconciliationIds = await validateReconciliationLinksForCreate(
            tx,
            session,
            input.reconciliationIds,
            draft.customerId,
            draft.contractLinks.map((link) => link.contractId),
          );
          const billingRequestId = input.billingRequestId?.trim() || null;
          let billingRequestLines: Array<{ id: string; reconciliationId: string; projectConfirmationId: string | null; requestedAmount: number; feeType: string; currency: string }> | null = null;
          if (billingRequestId) {
            const request = await tx.billingRequest.findFirst({
              where: { id: billingRequestId, status: "PROCESSING", documentType: "INVOICE", customerId: draft.customerId },
              select: {
                id: true,
                lines: {
                  select: {
                    id: true,
                    reconciliationId: true,
                    projectConfirmationId: true,
                    requestedAmount: true,
                    feeType: true,
                    currency: true,
                    reconciliation: { select: { contractId: true } },
                  },
                },
              },
            });
            const requestReconciliationIds = request?.lines.map((line) => line.reconciliationId) ?? [];
            const requestContractIds = Array.from(
              new Set(request?.lines.map((line) => line.reconciliation.contractId) ?? []),
            );
            const selectedContractIds = draft.contractLinks.map((line) => line.contractId);
            const sameReconciliations =
              requestReconciliationIds.length === reconciliationIds.length &&
              requestReconciliationIds.every((id) => reconciliationIds.includes(id));
            const sameContracts =
              requestContractIds.length === selectedContractIds.length &&
              requestContractIds.every((id) => selectedContractIds.includes(id));
            if (!request || !sameReconciliations || !sameContracts) {
              throw new Error("开票申请不存在、尚未受理，或与所选对账记录及合同不一致。");
            }
            billingRequestLines = request.lines.map((line) => ({
              id: line.id,
              reconciliationId: line.reconciliationId,
              projectConfirmationId: line.projectConfirmationId,
              requestedAmount: line.requestedAmount,
              feeType: line.feeType,
              currency: line.currency,
            }));
          }
          const { items, contractLinks, ...invoiceData } = draft;
          const sourcedItems = billingRequestLines
            ? items.map((item, index) => ({
                ...item,
                projectConfirmationId:
                  billingRequestLines[index]?.projectConfirmationId ?? null,
              }))
            : items;
          if (billingRequestLines && sourcedItems.length !== billingRequestLines.length) {
            throw new Error("Invoice 明细行必须与开票申请行逐一对应，不能新增或遗漏。");
          }
          const billingRequestedTotal = billingRequestLines?.reduce((sum, line) => sum + line.requestedAmount, 0) ?? 0;
          if (billingRequestLines && (invoiceData.totalAmount <= 0 || invoiceData.totalAmount > billingRequestedTotal + 0.01)) {
            throw new Error("Invoice 金额必须大于 0，且不能超过开票申请金额。");
          }
          const billingAllocationRatio = billingRequestedTotal > 0 ? invoiceData.totalAmount / billingRequestedTotal : 0;
          const invoice = await tx.invoice.create({
            data: {
              ...invoiceData,
              invoiceNo,
              billingRequestId,
              documentType: "INVOICE",
              issuedAt: invoiceData.status === "ISSUED" ? new Date() : null,
              createdById: session.userId,
              items: { create: sourcedItems },
              contractLinks: { create: contractLinks },
              reconciliationLinks: reconciliationIds.length
                ? {
                    create: reconciliationIds.map(
                      (reconciliationId, sortOrder) => ({
                        reconciliationId,
                        sortOrder,
                      }),
                    ),
                  }
                : undefined,
              billingAllocations: billingRequestLines
                ? { create: billingRequestLines.map((line) => ({ reconciliationId: line.reconciliationId, requestLineId: line.id, amount: roundMoney(line.requestedAmount * billingAllocationRatio), feeType: line.feeType, currency: line.currency })) }
                : undefined,
            },
            select: { id: true, invoiceNo: true, customerId: true, invoiceDate: true, dueDate: true, totalAmount: true, currency: true, accountsReceivableId: true, billingRequestId: true, status: true },
          });
          if (invoice.status === "ISSUED") {
            await ensureAccountsReceivableForIssuedInvoice(tx, invoice);
            await refreshBillingRequestStatus(tx, invoice.billingRequestId);
          }
          return invoice;
        });
        revalidatePath("/invoices");
        revalidatePath("/finance/billing");
        return {
          ok: true,
          id: created.id,
          invoiceNo: created.invoiceNo,
        };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          lastConflict = error;
          continue;
        }
        throw error;
      }
    }
    console.warn("[createInvoice] invoice number conflict:", lastConflict);
    return { ok: false, error: "Invoice 编号冲突，请重新提交" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateInvoice(
  id: string,
  input: InvoiceDraftInput,
): Promise<InvoiceSaveResult> {
  try {
    const session = await requireInvoicePermission("EDIT");
    const existing = await prisma.invoice.findFirst({
      where: { id, deletedAt: null, ...invoiceScope(session) },
      select: { id: true, invoiceNo: true, status: true },
    });
    if (!existing) return { ok: false, error: "Invoice 不存在" };
    if (existing.status !== "DRAFT") {
      return { ok: false, error: "已开具或已作废的 Invoice 不可直接修改" };
    }
    const draft = await normalizedDraft(session, input);
    await prisma.$transaction(async (tx) => {
      const { items, contractLinks, ...invoiceData } = draft;
      const updated = await tx.invoice.updateMany({
        where: {
          id,
          deletedAt: null,
          status: "DRAFT",
          ...invoiceScope(session),
        },
        data: invoiceData,
      });
      if (updated.count !== 1) {
        throw new Error("Invoice 状态已变更，请刷新后重试");
      }
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.createMany({
        data: items.map((item) => ({ ...item, invoiceId: id })),
      });
      await tx.invoiceContract.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceContract.createMany({
        data: contractLinks.map((link) => ({ ...link, invoiceId: id })),
      });
    });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    return { ok: true, id, invoiceNo: existing.invoiceNo };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateInvoiceNumber(
  id: string,
  nextNumberInput: string,
  reasonInput: string,
): Promise<InvoiceSaveResult> {
  try {
    const session = await requireInvoicePermission("MANAGE");
    if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可修改 Invoice 编号" };
    const nextNumber = nextNumberInput.trim().replace(/\s+/g, "").toUpperCase();
    const reason = reasonInput.trim();
    if (!nextNumber) return { ok: false, error: "请输入新 Invoice 编号" };
    if (reason.length < 2) return { ok: false, error: "请填写完整的修改原因" };
    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, invoiceNo: true, accountsReceivableId: true, deletedAt: true },
    });
    if (!existing || existing.deletedAt) return { ok: false, error: "Invoice 不存在" };
    if (existing.invoiceNo === nextNumber) return { ok: false, error: "新编号与当前编号相同" };
    try {
      await prisma.$transaction(async (tx) => {
        if (!(await releaseDeletedInvoiceNumber(tx, nextNumber, id))) {
          throw new Error("ACTIVE_NUMBER_CONFLICT");
        }
        await tx.invoice.update({ where: { id }, data: { invoiceNo: nextNumber, pdfUrl: null } });
        if (existing.accountsReceivableId) {
          await tx.accountsReceivable.update({
            where: { id: existing.accountsReceivableId },
            data: { invoiceNo: nextNumber },
          });
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ACTIVE_NUMBER_CONFLICT") {
        return { ok: false, error: "该 Invoice 编号已存在，不能重复" };
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: false, error: "该 Invoice 编号已存在，不能重复" };
      }
      throw error;
    }
    await writeAdminAudit({
      actorId: session.userId, action: "CHANGE_INVOICE_NUMBER", module: "finance",
      targetType: "Invoice", targetId: id, targetLabel: nextNumber,
      summary: `管理员修改 Invoice 编号：${existing.invoiceNo} → ${nextNumber}`,
      before: { invoiceNo: existing.invoiceNo }, after: { invoiceNo: nextNumber }, metadata: { reason },
    });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    revalidatePath("/finance/workbench");
    return { ok: true, id, invoiceNo: nextNumber };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function setInvoiceStatus(
  id: string,
  status: "ISSUED" | "VOID",
): Promise<InvoiceSaveResult> {
  try {
    const session = await requireInvoicePermission(
      status === "VOID" ? "MANAGE" : "EDIT",
    );
    const existing = await prisma.invoice.findFirst({
      where: { id, deletedAt: null, ...invoiceScope(session) },
      include: {
        items: {
          select: {
            id: true,
            currency: true,
            amount: true,
            periodType: true,
            periodLabel: true,
          },
        },
      },
    });
    if (!existing) return { ok: false, error: "Invoice 不存在" };
    if (status === "ISSUED") {
      if (existing.status !== "DRAFT") {
        return { ok: false, error: "仅草稿可以正式开具" };
      }
      const bank = parseBankSnapshot(existing.bankSnapshot);
      if (!existing.clientName.trim() || existing.items.length === 0) {
        return { ok: false, error: "客户信息或收费项目尚未填写完整" };
      }
      let currencyTotals: Array<{ currency: string; amount: number }>;
      try {
        currencyTotals = summarizeCurrencyTotals(existing.items);
      } catch {
        return {
          ok: false,
          error: "收费项目币种或费用期间尚未填写完整",
        };
      }
      if (
        existing.items.some(
          (item) =>
            !PERIOD_TYPES.includes(item.periodType as InvoicePeriodType) ||
            !item.periodLabel.trim(),
        )
      ) {
        return { ok: false, error: "收费项目币种或费用期间尚未填写完整" };
      }
      if (currencyTotals.length > 1 && existing.accountsReceivableId) {
        return {
          ok: false,
          error: "混合币种 Invoice 不能关联单一应收账款，请先取消关联",
        };
      }
      if (!cleanNullable(bank.accountNo)) {
        return { ok: false, error: "请先选择有效收款账户" };
      }
    } else if (existing.status !== "ISSUED") {
      return { ok: false, error: "仅已开具的 Invoice 可以作废" };
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.updateMany({
        where: {
          id,
          deletedAt: null,
          status: status === "ISSUED" ? "DRAFT" : "ISSUED",
          ...invoiceScope(session),
        },
        data: { status, issuedAt: status === "ISSUED" ? new Date() : existing.issuedAt },
      });
      if (result.count !== 1) return result;
      if (status === "ISSUED") {
        const issuedInvoice = await tx.invoice.findUniqueOrThrow({
          where: { id },
          select: { id: true, invoiceNo: true, customerId: true, invoiceDate: true, dueDate: true, totalAmount: true, currency: true, accountsReceivableId: true, billingRequestId: true },
        });
        await ensureAccountsReceivableForIssuedInvoice(tx, issuedInvoice);
        await refreshBillingRequestStatus(tx, issuedInvoice.billingRequestId);
      } else {
        await refreshBillingRequestStatus(tx, existing.billingRequestId);
      }
      return result;
    });
    if (updated.count !== 1) {
      return { ok: false, error: "Invoice 状态已变更，请刷新后重试" };
    }
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    return { ok: true, id, invoiceNo: existing.invoiceNo };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function softDeleteInvoice(
  id: string,
): Promise<InvoiceSaveResult> {
  try {
    const session = await requireInvoicePermission("MANAGE");
    const existing = await prisma.invoice.findFirst({
      where: { id, deletedAt: null, ...invoiceScope(session) },
      select: { id: true, invoiceNo: true, status: true },
    });
    if (!existing) return { ok: false, error: "Invoice 不存在" };
    if (existing.status !== "DRAFT") {
      return { ok: false, error: "已开具的 Invoice 请使用作废，不可删除" };
    }
    const deleted = await prisma.invoice.updateMany({
      where: { id, deletedAt: null, status: "DRAFT", ...invoiceScope(session) },
      data: { deletedAt: new Date(), invoiceNo: deletedInvoiceNumber(existing.invoiceNo, existing.id), pdfUrl: null },
    });
    if (deleted.count !== 1) {
      return { ok: false, error: "Invoice 状态已变更，请刷新后重试" };
    }
    revalidatePath("/invoices");
    return { ok: true, id, invoiceNo: existing.invoiceNo };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
