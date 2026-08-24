import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { calcArRiskLevel, calcArStatus } from "@/lib/financeOperations";
import { calculateShareAmount, calcTieredCommission, formatShanghaiDay, parseTieredRules, selectBasicCommissionRate } from "@/lib/channelSplit";

const MONEY_EPSILON = 0.005;

export type ReceiptAllocationInput = {
  accountsReceivableId?: string;
  invoiceId?: string;
  reconciliationId?: string;
  feeType: "FIXED_FEE" | "COMMISSION";
  amount: number;
};

export function parseMoney(value: unknown, label: string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label}必须大于 0`);
  return Math.round(amount * 100) / 100;
}

export async function createCustomerReceipt(input: {
  customerId: string;
  currency: string;
  amount: number;
  receivedAt: Date;
  bankReference?: string;
  proofUrls?: string[];
  remark?: string;
  createdById: string;
  allocations: ReceiptAllocationInput[];
}) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, deletedAt: null }, select: { id: true } });
    if (!customer) throw new Error("客户不存在或已删除");
    const totalAllocated = input.allocations.reduce((sum, row) => sum + row.amount, 0);
    if (totalAllocated > input.amount + MONEY_EPSILON) throw new Error("核销金额不能超过本次到账金额");

    const invoiceIds = input.allocations.flatMap((row) => row.invoiceId ? [row.invoiceId] : []);
    const invoices = invoiceIds.length ? await tx.invoice.findMany({ where: { id: { in: invoiceIds }, customerId: input.customerId, deletedAt: null, status: "ISSUED" }, include: { billingAllocations: true } }) : [];
    const invoiceMap = new Map(invoices.map((row) => [row.id, row]));
    if (invoiceMap.size !== new Set(invoiceIds).size) throw new Error("部分票据不存在或不属于该客户");

    const arIds = input.allocations.flatMap((row) => row.accountsReceivableId ? [row.accountsReceivableId] : []);
    const receivables = arIds.length ? await tx.accountsReceivable.findMany({ where: { id: { in: arIds }, customerId: input.customerId } }) : [];
    const arMap = new Map(receivables.map((row) => [row.id, row]));
    if (arMap.size !== new Set(arIds).size) throw new Error("部分应收账款不存在或不属于该客户");

    const reconciliationIds = input.allocations.flatMap((row) => row.reconciliationId ? [row.reconciliationId] : []);
    const recCount = reconciliationIds.length ? await tx.customerReconciliation.count({ where: { id: { in: reconciliationIds }, customerId: input.customerId, deletedAt: null } }) : 0;
    if (recCount !== new Set(reconciliationIds).size) throw new Error("部分客户对账记录不存在或不属于该客户");

    const receiptNo = `RCPT-${input.receivedAt.toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const receipt = await tx.customerReceipt.create({ data: {
      receiptNo, customerId: input.customerId, currency: input.currency, amount: input.amount,
      receivedAt: input.receivedAt, bankReference: input.bankReference || null,
      proofUrls: JSON.stringify(input.proofUrls ?? []), remark: input.remark || null,
      createdById: input.createdById,
      status: totalAllocated <= MONEY_EPSILON ? "UNALLOCATED" : totalAllocated + MONEY_EPSILON < input.amount ? "PARTIAL" : "ALLOCATED",
    } });

    for (let index = 0; index < input.allocations.length; index += 1) {
      const row = input.allocations[index];
      const invoice = row.invoiceId ? invoiceMap.get(row.invoiceId) : null;
      const arId = row.accountsReceivableId ?? invoice?.accountsReceivableId ?? null;
      const ar = arId ? arMap.get(arId) ?? await tx.accountsReceivable.findUnique({ where: { id: arId } }) : null;
      if (invoice && normalizeCurrency(invoice.currency) !== normalizeCurrency(input.currency)) throw new Error(`票据 ${invoice.invoiceNo} 币种与到账币种不一致`);
      if (ar && normalizeCurrency(ar.currency) !== normalizeCurrency(input.currency)) throw new Error(`应收 ${ar.invoiceNo} 币种与到账币种不一致`);
      if (invoice && ar && invoice.accountsReceivableId !== ar.id) throw new Error(`票据 ${invoice.invoiceNo} 与所选应收账款不一致`);
      if (invoice && row.reconciliationId) {
        const allocation = invoice.billingAllocations.find((item) => item.reconciliationId === row.reconciliationId && item.feeType === row.feeType);
        if (!allocation) throw new Error(`票据 ${invoice.invoiceNo} 与所选客户对账或费用类型不一致`);
      }
      if (ar) {
        const activeAllocated = await tx.customerReceiptAllocation.aggregate({ where: { accountsReceivableId: ar.id, status: "ACTIVE" }, _sum: { allocatedAmount: true } });
        const remaining = ar.invoiceAmount - (activeAllocated._sum.allocatedAmount ?? 0);
        if (row.amount > remaining + MONEY_EPSILON) throw new Error(`应收 ${ar.invoiceNo} 的核销金额超过未收余额`);
      }
      const allocation = await tx.customerReceiptAllocation.create({ data: {
        idempotencyKey: `${receipt.id}:${index}`, receiptId: receipt.id,
        accountsReceivableId: arId, invoiceId: row.invoiceId ?? null,
        reconciliationId: row.reconciliationId ?? null, feeType: row.feeType,
        allocatedAmount: row.amount, createdById: input.createdById,
      } });
      if (row.reconciliationId) {
        await releaseChannelPayableForAllocation(tx, {
          allocationId: allocation.id,
          reconciliationId: row.reconciliationId,
          feeType: row.feeType,
          allocatedAmount: row.amount,
          currency: input.currency,
          actorId: input.createdById,
        });
      }
      if (ar) {
        const receivedAmount = Math.min(ar.invoiceAmount, ar.receivedAmount + row.amount);
        const snapshot = { ...ar, receivedAmount, actualReceivedDate: receivedAmount + MONEY_EPSILON >= ar.invoiceAmount ? input.receivedAt : ar.actualReceivedDate };
        await tx.accountsReceivable.update({ where: { id: ar.id }, data: {
          receivedAmount, actualReceivedDate: snapshot.actualReceivedDate,
          status: calcArStatus(snapshot), riskLevel: calcArRiskLevel(snapshot),
        } });
        ar.receivedAmount = receivedAmount;
      }
    }
    await tx.financeAuditLog.create({ data: { entityType: "CUSTOMER_RECEIPT", entityId: receipt.id, action: "CREATE_AND_ALLOCATE", actorId: input.createdById, toStatus: receipt.status, metadata: JSON.stringify({ totalAllocated, allocationCount: input.allocations.length }) } });
    return receipt;
  });
}

type ReleaseInput = {
  allocationId: string;
  reconciliationId: string;
  feeType: "FIXED_FEE" | "COMMISSION";
  allocatedAmount: number;
  currency: string;
  actorId: string;
};

async function releaseChannelPayableForAllocation(tx: Prisma.TransactionClient, input: ReleaseInput) {
  const existing = await tx.channelPayableSource.findFirst({ where: { allocationId: input.allocationId, feeType: input.feeType } });
  if (existing) return existing;
  const auditException = async (reason: string, metadata: Record<string, unknown> = {}) => {
    await tx.financeAuditLog.create({ data: { entityType: "CHANNEL_PAYABLE_EXCEPTION", entityId: input.allocationId, action: "AUTO_RELEASE_FAILED", actorId: input.actorId, toStatus: "EXCEPTION", note: reason, metadata: JSON.stringify({ reconciliationId: input.reconciliationId, feeType: input.feeType, ...metadata }) } });
    return null;
  };
  try {
    const reconciliation = await tx.customerReconciliation.findUnique({
      where: { id: input.reconciliationId },
      include: {
        customer: { select: { channelUserId: true, splitRules: { where: { contractId: null }, orderBy: { createdAt: "asc" } } } },
        contract: { include: { splitRule: true } },
      },
    });
    if (!reconciliation || reconciliation.deletedAt) return auditException("客户对账不存在或已删除");
    if (reconciliation.status !== "CONFIRMED") return auditException("客户对账尚未确认，不能释放渠道应付");
    const expectedFeeType = reconciliation.reconcileType === "FEE_ONLY" ? "FIXED_FEE" : reconciliation.reconcileType === "COMMISSION_ONLY" ? "COMMISSION" : null;
    if (!expectedFeeType || expectedFeeType !== input.feeType) return auditException("核销费用类型与客户对账类型不一致");
    if (!reconciliation.customer.channelUserId) return auditException("客户未关联渠道商");
    const channelUser = await tx.user.findFirst({ where: { id: reconciliation.customer.channelUserId, role: "CHANNEL", status: "APPROVED" }, select: { id: true } });
    if (!channelUser) return auditException("关联渠道商不存在或未审核通过");
    if (reconciliation.customer.splitRules.length > 1) return auditException("客户存在多条默认分账规则，无法确定应使用哪一条");
    const rule = reconciliation.customer.splitRules[0] ?? reconciliation.contract.splitRule;
    if (!rule) return auditException("客户及合同均未配置有效分账规则");
    if (!reconciliation.contract.startDate) return auditException("合同缺少开始日期");
    const rangeEnd = rule.splitEndDate ?? reconciliation.contract.endDate;
    if (!rangeEnd) return auditException("分账规则及合同均缺少结束日期");
    if (reconciliation.periodEnd.getTime() > rangeEnd.getTime()) return auditException("客户对账周期已超出分账规则有效期");

    let channelReconciliation = await tx.channelReconciliation.findFirst({ where: { customerId: reconciliation.customerId, contractId: reconciliation.contractId, splitRuleId: rule.id, recordMode: "RULE_DRIVEN", deletedAt: null }, include: { periods: true }, orderBy: { createdAt: "asc" } });
    if (!channelReconciliation) {
      channelReconciliation = await tx.channelReconciliation.create({
        data: {
          customerId: reconciliation.customerId, channelUserId: channelUser.id, splitRuleId: rule.id,
          recordMode: "RULE_DRIVEN", contractId: reconciliation.contractId,
          customerReconciliationId: null, settlementId: null,
          periodStart: reconciliation.periodStart, periodEnd: reconciliation.periodEnd, periodNo: 1,
          periodType: "incremental", totalPeriods: 0,
          fixedFeeShareRate: rule.fixedFeeRate,
          commissionShareRate: rule.ruleType === "A" ? rule.commissionBelowRate : 0,
          fixedFeeReceivedCurrency: normalizeCurrency(input.currency), commissionReceivedCurrency: normalizeCurrency(input.currency),
          fixedFeeShareCurrency: normalizeCurrency(input.currency), commissionShareCurrency: normalizeCurrency(input.currency),
          note: "客户收款核销自动创建", createdById: input.actorId,
        }, include: { periods: true },
      });
    }
    const streamType = input.feeType;
    let period = channelReconciliation.periods.find((row) => row.streamType === streamType && row.periodStart?.getTime() === reconciliation.periodStart.getTime() && row.periodEnd?.getTime() === reconciliation.periodEnd.getTime());
    if (!period) {
      const latest = await tx.channelReconciliationPeriod.findFirst({ where: { reconciliationId: channelReconciliation.id }, orderBy: { periodIndex: "desc" }, select: { periodIndex: true } });
      const periodIndex = (latest?.periodIndex ?? 0) + 1;
      period = await tx.channelReconciliationPeriod.create({ data: {
        reconciliationId: channelReconciliation.id, streamType, periodIndex,
        periodLabel: `${formatShanghaiDay(reconciliation.periodStart)} ~ ${formatShanghaiDay(reconciliation.periodEnd)}`,
        periodStart: reconciliation.periodStart, periodEnd: reconciliation.periodEnd,
        fixedFeeShareRate: streamType === "FIXED_FEE" ? rule.fixedFeeRate : null,
        commissionShareRate: streamType === "COMMISSION" && rule.ruleType === "A" ? rule.commissionBelowRate : null,
      } });
      await tx.channelReconciliation.update({ where: { id: channelReconciliation.id }, data: {
        totalPeriods: { increment: 1 },
        periodStart: channelReconciliation.periodStart && channelReconciliation.periodStart.getTime() <= reconciliation.periodStart.getTime() ? channelReconciliation.periodStart : reconciliation.periodStart,
        periodEnd: channelReconciliation.periodEnd && channelReconciliation.periodEnd.getTime() >= reconciliation.periodEnd.getTime() ? channelReconciliation.periodEnd : reconciliation.periodEnd,
      } });
    }
    if (!period) return auditException("未找到与客户对账周期匹配的渠道分账周期", { channelReconciliationId: channelReconciliation.id });
    const sourceExists = await tx.channelPayableSource.findUnique({ where: { allocationId_channelPeriodId_feeType: { allocationId: input.allocationId, channelPeriodId: period.id, feeType: input.feeType } } });
    if (sourceExists) return sourceExists;

    const receivedBefore = input.feeType === "FIXED_FEE" ? (period.fixedFeeReceived ?? 0) : (period.commissionReceived ?? 0);
    const shareBefore = input.feeType === "FIXED_FEE" ? (period.fixedFeeShareAmount ?? 0) : (period.commissionShareAmount ?? 0);
    const receivedAfter = Math.round((receivedBefore + input.allocatedAmount + Number.EPSILON) * 100) / 100;
    let rate: number;
    let shareAfter: number;
    if (input.feeType === "FIXED_FEE") {
      rate = rule.fixedFeeRate;
      shareAfter = calculateShareAmount(receivedAfter, rate);
    } else if (rule.ruleType === "A") {
      const ruleCurrency = normalizeCurrency(rule.commissionThresholdCurrency);
      if (normalizeCurrency(input.currency) !== ruleCurrency) return auditException("A类佣金到账币种与规则阈值币种不一致", { expectedCurrency: ruleCurrency, actualCurrency: input.currency });
      rate = selectBasicCommissionRate(receivedAfter, rule.commissionThresholdAmount, rule.commissionBelowRate, rule.commissionAtOrAboveRate);
      shareAfter = calculateShareAmount(receivedAfter, rate);
    } else {
      const gmv = reconciliation.finalSalesAmount ?? reconciliation.actualSalesAmount;
      const tierAmount = calcTieredCommission(gmv, parseTieredRules(JSON.parse(rule.tieredRules)));
      shareAfter = Math.round((Math.min(tierAmount, receivedAfter) + Number.EPSILON) * 100) / 100;
      rate = receivedAfter > 0 ? shareAfter / receivedAfter : 0;
    }
    const payableDelta = Math.max(0, Math.round((shareAfter - shareBefore + Number.EPSILON) * 100) / 100);
    await tx.channelReconciliationPeriod.update({
      where: { id: period.id },
      data: input.feeType === "FIXED_FEE"
        ? { fixedFeeReceived: receivedAfter, fixedFeeReceivedCurrency: normalizeCurrency(input.currency), fixedFeeShareRate: rate, fixedFeeShareAmount: shareAfter, fixedFeeSplitDate: new Date(), payableStatus: "ELIGIBLE" }
        : { commissionReceived: receivedAfter, commissionReceivedCurrency: normalizeCurrency(input.currency), commissionShareRate: rate, commissionShareAmount: shareAfter, commissionSplitDate: new Date(), confirmedGmv: reconciliation.finalSalesAmount ?? reconciliation.actualSalesAmount, payableStatus: "ELIGIBLE" },
    });
    const source = await tx.channelPayableSource.create({ data: { allocationId: input.allocationId, channelPeriodId: period.id, reconciliationId: input.reconciliationId, feeType: input.feeType, sourceAmount: input.allocatedAmount, shareRateSnapshot: rate, payableAmount: payableDelta, currency: normalizeCurrency(input.currency) } });
    await tx.financeAuditLog.create({ data: { entityType: "CHANNEL_PAYABLE_SOURCE", entityId: source.id, action: "AUTO_RELEASE", actorId: input.actorId, toStatus: "ELIGIBLE", metadata: JSON.stringify({ allocationId: input.allocationId, channelReconciliationId: channelReconciliation.id, channelPeriodId: period.id, receivedAfter, shareAfter, payableDelta }) } });
    return source;
  } catch (error) {
    return auditException(error instanceof Error ? error.message : "渠道应付自动释放发生未知异常");
  }
}

function normalizeCurrency(value: string) { const normalized = value.trim().toUpperCase(); if (["人民币", "CNY", "RMB"].includes(normalized)) return "RMB"; if (["美金", "美元", "US$"].includes(normalized)) return "USD"; return normalized; }

export async function releaseExistingReceiptAllocation(allocationId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const allocation = await tx.customerReceiptAllocation.findUnique({
      where: { id: allocationId },
      include: { receipt: { select: { currency: true } } },
    });
    if (!allocation || allocation.status !== "ACTIVE") throw new Error("有效核销分配不存在");
    if (!allocation.reconciliationId) throw new Error("核销分配未关联客户对账，无法释放渠道应付");
    return releaseChannelPayableForAllocation(tx, {
      allocationId: allocation.id,
      reconciliationId: allocation.reconciliationId,
      feeType: allocation.feeType === "COMMISSION" ? "COMMISSION" : "FIXED_FEE",
      allocatedAmount: allocation.allocatedAmount,
      currency: allocation.receipt.currency,
      actorId,
    });
  });
}

export async function refreshChannelPeriodPaymentStatus(periodId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.channelReconciliationPeriod.findUnique({ where: { id: periodId }, include: { payments: { where: { status: "PAID" } }, businessDocuments: true } });
    if (!period) throw new Error("渠道对账周期不存在");
    const due = (period.fixedFeeShareAmount ?? 0) + (period.commissionShareAmount ?? 0);
    const paid = period.payments.reduce((sum, row) => sum + row.amount, 0);
    const hasApprovedDocument = period.businessDocuments.some((row) => row.status === "APPROVED");
    const payableStatus = paid + MONEY_EPSILON >= due && due > 0 ? "PAID" : paid > MONEY_EPSILON ? "PARTIALLY_PAID" : hasApprovedDocument ? "WAITING_PAYMENT" : period.payableStatus;
    await tx.channelReconciliationPeriod.update({ where: { id: periodId }, data: { payableStatus, paymentVersion: { increment: 1 } } });
    await tx.financeAuditLog.create({ data: { entityType: "CHANNEL_PERIOD", entityId: periodId, action: "REFRESH_PAYMENT_STATUS", actorId, toStatus: payableStatus, metadata: JSON.stringify({ due, paid }) } });
    return { due, paid, payableStatus };
  });
}
