"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { customerScope, isStaff } from "@/lib/dataScope";
import type { PermLevel } from "@/lib/featurePermissions";
import {
  INVOICE_BANK_ACCOUNTS,
  invoiceBankAccountForKey,
  normalizeInvoiceBankKey,
  type InvoiceBankAccount,
} from "@/lib/invoiceBankAccounts";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";

const INVOICE_FEATURE = "operations.invoices";
const INVOICE_STATUSES = ["DRAFT", "ISSUED", "VOID"] as const;
const PERIOD_TYPES = ["MONTH", "DATE_RANGE"] as const;
const FEE_TYPES = ["MONTHLY_FEE", "SALES_COMMISSION"] as const;
const MAX_INVOICE_AMOUNT = 1_000_000_000;
const MAX_LINE_ITEMS = 100;

type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
type InvoicePeriodType = (typeof PERIOD_TYPES)[number];
type InvoiceFeeType = (typeof FEE_TYPES)[number];
type InvoiceSummaryFeeType = InvoiceFeeType | "MIXED";

export type InvoiceItemInput = {
  feeType: InvoiceFeeType;
  description: string;
  promoPlatform?: string | null;
  targetSite?: string | null;
  affiliatePlatform?: string | null;
  quantity: number;
  unitPrice: number;
  sortOrder?: number;
};

export type InvoiceDraftInput = {
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
  status: InvoiceStatus;
  createdByName: string | null;
  createdAt: string;
};

export type InvoiceDetail = {
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
  bankAccountKey: string | null;
  bankSnapshot: Partial<InvoiceBankAccount>;
  terms: string | null;
  status: InvoiceStatus;
  pdfUrl: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<InvoiceItemInput & { id: string; amount: number }>;
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
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== clean) {
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
      feeType: item.feeType,
      description,
      promoPlatform: cleanNullable(item.promoPlatform),
      targetSite: cleanNullable(item.targetSite),
      affiliatePlatform: cleanNullable(item.affiliatePlatform),
      quantity,
      unitPrice: roundMoney(unitPrice),
      amount: roundMoney(amount),
      sortOrder: Number.isInteger(item.sortOrder) ? Number(item.sortOrder) : index,
    };
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Invoice 操作失败，请稍后重试";
}

async function validateRelations(
  session: Awaited<ReturnType<typeof requireInvoicePermission>>,
  customerId: string,
  contractIds: string[],
  accountsReceivableId?: string | null,
) {
  const contracts = await prisma.contract.findMany({
    where: {
      id: { in: contractIds },
      customerId,
      deletedAt: null,
      customer: {
        id: customerId,
        deletedAt: null,
        ...customerScope(session, session.role === "ADMIN" ? "all" : "mine"),
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
  const contractMap = new Map(contracts.map((contract) => [contract.id, contract]));
  const contract = contractMap.get(contractIds[0]);
  if (!contract) throw new Error("请选择有效的主合同");

  if (accountsReceivableId) {
    const receivable = await prisma.accountsReceivable.findFirst({
      where: {
        id: accountsReceivableId,
        customerId,
        customer: {
          deletedAt: null,
          ...customerScope(session, session.role === "ADMIN" ? "all" : "mine"),
        },
      },
      select: { id: true },
    });
    if (!receivable) throw new Error("应收账款不存在或不属于所选客户");
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
    where: { invoiceNo: { startsWith: prefix } },
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
  const contractIds = Array.from(new Set(
    (input.contractIds?.length ? input.contractIds : [input.contractId])
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id)),
  ));
  if (!contractIds.length) throw new Error("请选择关联合同");
  if (!PERIOD_TYPES.includes(input.periodType)) throw new Error("账期类型不正确");

  const invoiceDate = parseDate(input.invoiceDate, "Invoice 日期");
  const dueDate = parseDate(input.dueDate, "付款截止日");
  if (dueDate < invoiceDate) throw new Error("付款截止日不能早于 Invoice 日期");

  const relation = await validateRelations(
    session,
    input.customerId,
    contractIds,
    cleanNullable(input.accountsReceivableId),
  );
  const items = normalizeItems(input.items);
  const feeTypes = new Set(items.map((item) => item.feeType));
  const feeType: InvoiceSummaryFeeType = feeTypes.size > 1
    ? "MIXED"
    : items[0]?.feeType ?? "MONTHLY_FEE";
  const periodLabel = input.periodLabel.trim();
  if (!periodLabel || periodLabel.length > 120) {
    throw new Error("费用期间必填且不能超过 120 个字符");
  }
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
    accountsReceivableId: cleanNullable(input.accountsReceivableId),
    invoiceDate,
    dueDate,
    periodType: input.periodType,
    periodLabel,
    feeType,
    clientName,
    clientAddress:
      cleanNullable(input.clientAddress) ?? cleanNullable(relation.partyAAddress),
    currency: normalizeCurrency(input.currency),
    bankAccountKey: selectedBankKey
      ? normalizeInvoiceBankKey(selectedBankKey)
      : null,
    bankSnapshot: JSON.stringify(bankSnapshot),
    terms: cleanNullable(input.terms),
    status: input.status ?? "DRAFT",
    items,
    totalAmount: (() => {
      const total = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
      if (!Number.isFinite(total) || total > MAX_INVOICE_AMOUNT) {
        throw new Error("Invoice 总金额超出允许范围");
      }
      return total;
    })(),
  };
}

function invoiceScope(
  session: Awaited<ReturnType<typeof requireInvoicePermission>>,
): Prisma.InvoiceWhereInput {
  if (session.role === "ADMIN") return {};
  return {
    OR: [
      { createdById: session.userId },
      { customer: customerScope(session, "mine") as Prisma.CustomerWhereInput },
    ],
  };
}

export async function getInvoiceFormOptions(): Promise<InvoiceFormOptions> {
  const session = await requireInvoicePermission("READ");
  const scopedCustomers = customerScope(
    session,
    session.role === "ADMIN" ? "all" : "mine",
  );
  const [customers, contracts, accountsReceivables] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null, ...scopedCustomers },
      orderBy: { brandName: "asc" },
      select: { id: true, brandName: true },
    }),
    prisma.contract.findMany({
      where: {
        deletedAt: null,
        customerId: { not: null },
        customer: { deletedAt: null, ...scopedCustomers },
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
        customer: { deletedAt: null, ...scopedCustomers },
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
      return [{
        id: contract.id,
        customerId: contract.customerId,
        contractNo: contract.contractNo,
        partyACompany: contract.partyA ?? "",
        address: contract.partyAAddress ?? "",
        platforms: parseStringList(contract.promoPlatform),
        targetSites: parseStringList(contract.targetSite),
        affiliatePlatforms: parseStringList(contract.coopChannels),
        bankAccounts,
      }];
    }),
    accountsReceivables: accountsReceivables.flatMap((row) =>
      row.customerId
        ? [{
            id: row.id,
            customerId: row.customerId,
            label: row.invoiceNo,
            amount: row.invoiceAmount,
            currency: row.currency,
          }]
        : [],
    ),
    bankAccounts: Object.values(INVOICE_BANK_ACCOUNTS),
  };
}

export async function listInvoices(input?: {
  search?: string;
  status?: InvoiceStatus | "ALL";
}): Promise<InvoiceListItem[]> {
  const session = await requireInvoicePermission("READ");
  const search = input?.search?.trim();
  const status =
    input?.status && input.status !== "ALL" && INVOICE_STATUSES.includes(input.status)
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
    },
  });
  return rows.map((row) => ({
    id: row.id,
    invoiceNo: row.invoiceNo,
    customerId: row.customerId,
    customerName: row.customer?.brandName ?? row.clientName,
    contractId: row.contractId,
    contractNo: row.contractLinks.length
      ? row.contractLinks.map((link) => link.contract.contractNo).join("、")
      : row.contract?.contractNo ?? null,
    invoiceDate: isoDate(row.invoiceDate),
    dueDate: isoDate(row.dueDate),
    periodLabel: row.periodLabel,
    feeType: row.feeType as InvoiceSummaryFeeType,
    currency: row.currency,
    totalAmount: row.totalAmount,
    status: row.status as InvoiceStatus,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
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
    bankSnapshot: parseBankSnapshot(row.bankSnapshot),
    terms: row.terms,
    status: row.status as InvoiceStatus,
    pdfUrl: row.pdfUrl,
    createdById: row.createdById,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      feeType: item.feeType as InvoiceFeeType,
      description: item.description,
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
          const { items, contractLinks, ...invoiceData } = draft;
          return tx.invoice.create({
            data: {
              ...invoiceData,
              invoiceNo,
              createdById: session.userId,
              items: { create: items },
              contractLinks: { create: contractLinks },
            },
            select: { id: true, invoiceNo: true },
          });
        });
        revalidatePath("/invoices");
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

export async function setInvoiceStatus(
  id: string,
  status: "ISSUED" | "VOID",
): Promise<InvoiceSaveResult> {
  try {
    const session = await requireInvoicePermission(status === "VOID" ? "MANAGE" : "EDIT");
    const existing = await prisma.invoice.findFirst({
      where: { id, deletedAt: null, ...invoiceScope(session) },
      include: { items: { select: { id: true } } },
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
      if (!cleanNullable(bank.accountNo)) {
        return { ok: false, error: "请先选择有效收款账户" };
      }
    } else if (existing.status !== "ISSUED") {
      return { ok: false, error: "仅已开具的 Invoice 可以作废" };
    }
    const updated = await prisma.invoice.updateMany({
      where: {
        id,
        deletedAt: null,
        status: status === "ISSUED" ? "DRAFT" : "ISSUED",
        ...invoiceScope(session),
      },
      data: { status },
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
      where: {
        id,
        deletedAt: null,
        status: "DRAFT",
        ...invoiceScope(session),
      },
      data: { deletedAt: new Date() },
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
