"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import {
  calcRevenueGrade, calcArStatus, calcArRiskLevel,
  probabilityForStage, currentMonthKey, monthRange,
} from "@/lib/financeOperations";

export type SaveResult = { ok: boolean; error?: string; id?: string };

// =============================================================================
// Client Revenue Snapshot
// =============================================================================

/** Parse a fee amount string into a number (strips commas and units) */
function parseAmount(raw: string | null): number {
  if (!raw) return 0;
  // Strip ASCII comma, Chinese comma U+FF0C and whitespace.
  const cleaned = raw.replace(/[,，\s]/g, "");
  const m = cleaned.match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/** Parse a commission rate string such as "8%" or "0.08" -> 0.08 */
function parseRate(raw: string | null): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[,，\s]/g, "");
  const m = cleaned.match(/(\d+(\.\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (cleaned.includes("%")) return n / 100;
  return n > 1 ? n / 100 : n;
}

/** Default USD->RMB rate when caller does not provide one (placeholder until FX API wired) */
const DEFAULT_USD_RMB = 7.2;

/**
 * Generate/refresh client revenue snapshots for the given month.
 * Inputs: Customer + Contract + SalesRecord + (optional) CustomerReconciliation.
 * Upsert based on the unique constraint (customerId, month).
 */
export async function generateMonthlySnapshot(
  monthInput?: string,
  exchangeRateOverride?: number,
): Promise<{ ok: boolean; created: number; updated: number; error?: string }> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, created: 0, updated: 0, error: "无权操作" };

  const month = monthInput || currentMonthKey();
  const { start, end } = monthRange(month);
  const exchangeRate = exchangeRateOverride && exchangeRateOverride > 0 ? exchangeRateOverride : DEFAULT_USD_RMB;

  // Pull all live customers along with their signed/in-progress contracts.
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    include: {
      contracts: {
        where: { status: { in: ["SIGNING", "COMPLETED"] } },
        orderBy: { startDate: "asc" },
      },
    },
  });

  let created = 0;
  let updated = 0;
  for (const c of customers) {
    // Pick the earliest contract as the project start anchor.
    const earliestContract = c.contracts.find((ct) => ct.startDate) ?? c.contracts[0] ?? null;
    if (!earliestContract) continue; // customers without any contract are skipped

    // Monthly fee / currency / commission rate
    const feeCurrencyRaw = earliestContract.feeCurrency ?? "RMB";
    // Treat "USD" / "美金" (US dollar) as USD; everything else as RMB.
    const isUsd = feeCurrencyRaw.toUpperCase() === "USD" || feeCurrencyRaw.includes("美");
    const monthlyFeeCurrency = isUsd ? "USD" : "RMB";
    const monthlyFeeAmount = parseAmount(earliestContract.feeAmount);
    const monthlyFeeRmb = monthlyFeeCurrency === "USD" ? monthlyFeeAmount * exchangeRate : monthlyFeeAmount;
    const commissionRate = parseRate(earliestContract.commissionRate);

    // Monthly GMV from BI sales records.
    const salesAgg = await prisma.salesRecord.aggregate({
      where: { customerId: c.id, deletedAt: null, orderDate: { gte: start, lte: end } },
      _sum: { revenue: true },
    });
    const monthlyGmv = salesAgg._sum.revenue ?? 0;

    // Monthly commission income: prefer reconciliation final number when present.
    const rec = await prisma.customerReconciliation.findFirst({
      where: { customerId: c.id, periodStart: { gte: start }, periodEnd: { lte: end }, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const monthlyCommissionIncome = rec?.finalCommissionAmount ?? rec?.commissionAmount ?? (monthlyGmv * commissionRate);

    const monthlyTotalIncome = monthlyFeeRmb + monthlyCommissionIncome;

    // Client status mapping.
    let clientStatus: "NEW" | "ACTIVE" | "CHURNED" | "PAUSED" = "ACTIVE";
    if (c.status === "CHURNED") clientStatus = "CHURNED";
    else if (c.status === "PAUSED") clientStatus = "PAUSED";
    else {
      // If the customer was created in the snapshot month, mark NEW.
      const cy = c.createdAt.getFullYear();
      const cm = c.createdAt.getMonth() + 1;
      if (`${cy}-${String(cm).padStart(2, "0")}` === month) clientStatus = "NEW";
    }

    // Cumulative income = sum of previous months + this month value.
    const past = await prisma.clientRevenueSnapshot.aggregate({
      where: { customerId: c.id, month: { lt: month } },
      _sum: { monthlyTotalIncome: true },
    });
    const cumulativeIncome = (past._sum.monthlyTotalIncome ?? 0) + monthlyTotalIncome;

    const revenueGrade = calcRevenueGrade(monthlyTotalIncome);

    const existed = await prisma.clientRevenueSnapshot.findUnique({
      where: { customerId_month: { customerId: c.id, month } },
    });

    const data = {
      customerId: c.id,
      month,
      projectStartDate: earliestContract.startDate,
      clientStatus,
      monthlyFeeCurrency,
      monthlyFeeAmount,
      exchangeRate,
      monthlyFeeRmb,
      commissionRate,
      monthlyGmv,
      monthlyCommissionIncome,
      monthlyTotalIncome,
      cumulativeIncome,
      amOwnerId: c.backendOwnerId,
      bdOwnerId: c.businessOwnerId,
      revenueGrade,
    };

    if (existed) {
      await prisma.clientRevenueSnapshot.update({ where: { id: existed.id }, data });
      updated++;
    } else {
      await prisma.clientRevenueSnapshot.create({ data });
      created++;
    }
  }

  revalidatePath("/operations");
  revalidatePath("/dashboard");
  return { ok: true, created, updated };
}

export async function updateSnapshot(
  id: string,
  patch: {
    revenueGrade?: string;
    signingCompany?: string | null;
    receivingCompany?: string | null;
    clientStatus?: string;
    remark?: string | null;
  },
): Promise<SaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  await prisma.clientRevenueSnapshot.update({
    where: { id },
    data: patch as Record<string, unknown>,
  });
  revalidatePath("/operations");
  return { ok: true, id };
}

// =============================================================================
// Accounts Receivable
// =============================================================================

export async function createAR(payload: {
  customerId?: string | null;
  invoiceNo: string;
  invoiceDate: string;
  invoiceAmount: number;
  currency: "USD" | "RMB";
  exchangeRate?: number;
  receivedAmount?: number;
  dueDate: string;
  actualReceivedDate?: string | null;
  followOwnerId?: string | null;
  remark?: string | null;
}): Promise<SaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  if (!payload.invoiceNo?.trim()) return { ok: false, error: "请填写发票号" };
  if (!payload.invoiceDate) return { ok: false, error: "请选择开票日期" };
  if (!payload.dueDate) return { ok: false, error: "请选择应收到期日" };
  if (!(payload.invoiceAmount > 0)) return { ok: false, error: "发票金额需大于 0" };

  const exchangeRate = payload.exchangeRate && payload.exchangeRate > 0
    ? payload.exchangeRate
    : (payload.currency === "USD" ? DEFAULT_USD_RMB : 1);
  const amountRmb = payload.currency === "USD" ? payload.invoiceAmount * exchangeRate : payload.invoiceAmount;
  const dueDate = new Date(payload.dueDate);
  const receivedAmount = payload.receivedAmount ?? 0;
  const actualReceivedDate = payload.actualReceivedDate ? new Date(payload.actualReceivedDate) : null;
  const row = { invoiceAmount: payload.invoiceAmount, receivedAmount, dueDate, actualReceivedDate };
  const status = calcArStatus(row);
  const riskLevel = calcArRiskLevel(row);

  // Unique invoice number guard
  const dup = await prisma.accountsReceivable.findUnique({ where: { invoiceNo: payload.invoiceNo } });
  if (dup) return { ok: false, error: "发票号已存在" };

  const ar = await prisma.accountsReceivable.create({
    data: {
      customerId: payload.customerId || null,
      invoiceNo: payload.invoiceNo.trim(),
      invoiceDate: new Date(payload.invoiceDate),
      invoiceAmount: payload.invoiceAmount,
      currency: payload.currency,
      exchangeRate,
      amountRmb,
      receivedAmount,
      dueDate,
      actualReceivedDate,
      status,
      riskLevel,
      followOwnerId: payload.followOwnerId || null,
      remark: payload.remark || null,
    },
  });
  revalidatePath("/operations");
  void session;
  return { ok: true, id: ar.id };
}

export async function updateAR(
  id: string,
  patch: {
    receivedAmount?: number;
    actualReceivedDate?: string | null;
    followOwnerId?: string | null;
    remark?: string | null;
  },
): Promise<SaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  const existing = await prisma.accountsReceivable.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "记录不存在" };

  const receivedAmount = patch.receivedAmount ?? existing.receivedAmount;
  const actualReceivedDate = patch.actualReceivedDate !== undefined
    ? (patch.actualReceivedDate ? new Date(patch.actualReceivedDate) : null)
    : existing.actualReceivedDate;
  const row = {
    invoiceAmount: existing.invoiceAmount,
    receivedAmount,
    dueDate: existing.dueDate,
    actualReceivedDate,
  };
  const status = calcArStatus(row);
  const riskLevel = calcArRiskLevel(row);
  await prisma.accountsReceivable.update({
    where: { id },
    data: {
      receivedAmount,
      actualReceivedDate,
      status,
      riskLevel,
      followOwnerId: patch.followOwnerId ?? existing.followOwnerId,
      remark: patch.remark ?? existing.remark,
    },
  });
  revalidatePath("/operations");
  void session;
  return { ok: true, id };
}

export async function deleteAR(id: string): Promise<SaveResult> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可删除应收账款" };
  await prisma.accountsReceivable.delete({ where: { id } });
  revalidatePath("/operations");
  return { ok: true, id };
}

/** Bulk recalculate status + riskLevel for every AR row using today as the reference date. */
export async function refreshArRisks(): Promise<{ ok: boolean; updated: number }> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, updated: 0 };
  const all = await prisma.accountsReceivable.findMany();
  let updated = 0;
  for (const a of all) {
    const row = {
      invoiceAmount: a.invoiceAmount,
      receivedAmount: a.receivedAmount,
      dueDate: a.dueDate,
      actualReceivedDate: a.actualReceivedDate,
    };
    const status = calcArStatus(row);
    const riskLevel = calcArRiskLevel(row);
    if (status !== a.status || riskLevel !== a.riskLevel) {
      await prisma.accountsReceivable.update({ where: { id: a.id }, data: { status, riskLevel } });
      updated++;
    }
  }
  revalidatePath("/operations");
  return { ok: true, updated };
}

// =============================================================================
// Sales Pipeline
// =============================================================================

export async function createPipeline(payload: {
  prospectName: string;
  source?: string | null;
  countryRegion?: string | null;
  category?: string | null;
  estimatedMonthlyFee?: number | null;
  estimatedCommissionRate?: number | null;
  estimatedGmv?: number | null;
  stage?: string;
  expectedSignDate?: string | null;
  bdOwnerId?: string | null;
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
  remark?: string | null;
}): Promise<SaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  if (!payload.prospectName?.trim()) return { ok: false, error: "请填写潜在客户名称" };
  const stage = payload.stage || "LEAD";
  const probability = probabilityForStage(stage);
  const p = await prisma.salesPipeline.create({
    data: {
      prospectName: payload.prospectName.trim(),
      source: payload.source || null,
      countryRegion: payload.countryRegion || null,
      category: payload.category || null,
      estimatedMonthlyFee: payload.estimatedMonthlyFee ?? null,
      estimatedCommissionRate: payload.estimatedCommissionRate ?? null,
      estimatedGmv: payload.estimatedGmv ?? null,
      stage,
      probability,
      expectedSignDate: payload.expectedSignDate ? new Date(payload.expectedSignDate) : null,
      bdOwnerId: payload.bdOwnerId || null,
      nextAction: payload.nextAction || null,
      nextFollowUpAt: payload.nextFollowUpAt ? new Date(payload.nextFollowUpAt) : null,
      remark: payload.remark || null,
    },
  });
  revalidatePath("/operations");
  void session;
  return { ok: true, id: p.id };
}

export async function updatePipelineStage(id: string, stage: string): Promise<SaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  await prisma.salesPipeline.update({
    where: { id },
    data: { stage, probability: probabilityForStage(stage) },
  });
  revalidatePath("/operations");
  return { ok: true, id };
}

export async function updatePipeline(
  id: string,
  patch: {
    prospectName?: string;
    source?: string | null;
    countryRegion?: string | null;
    category?: string | null;
    estimatedMonthlyFee?: number | null;
    estimatedCommissionRate?: number | null;
    estimatedGmv?: number | null;
    stage?: string;
    expectedSignDate?: string | null;
    bdOwnerId?: string | null;
    nextAction?: string | null;
    nextFollowUpAt?: string | null;
    remark?: string | null;
  },
): Promise<SaveResult> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { ...patch };
  if (patch.stage) data.probability = probabilityForStage(patch.stage);
  if (patch.expectedSignDate !== undefined) {
    data.expectedSignDate = patch.expectedSignDate ? new Date(patch.expectedSignDate) : null;
  }
  if (patch.nextFollowUpAt !== undefined) {
    data.nextFollowUpAt = patch.nextFollowUpAt ? new Date(patch.nextFollowUpAt) : null;
  }
  await prisma.salesPipeline.update({ where: { id }, data });
  revalidatePath("/operations");
  return { ok: true, id };
}

export async function deletePipeline(id: string): Promise<SaveResult> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可删除销售漏斗" };
  await prisma.salesPipeline.delete({ where: { id } });
  revalidatePath("/operations");
  return { ok: true, id };
}
