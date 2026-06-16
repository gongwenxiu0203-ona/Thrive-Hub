"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import {
  splitPeriodsByMonth,
  parseTieredRules,
} from "@/lib/channelSplit";

export interface SplitRuleInput {
  customerId: string;
  ruleType: "A" | "B";
  splitEndDate: string;          // ISO yyyy-mm-dd or full ISO
  fixedFeeRate: number;          // 0~1
  commissionRate?: number | null; // 0~1, A only
  tieredRules?: { gmvMin: number; gmvMax: number | null; rate: number }[]; // B only
}

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

function validateInput(input: SplitRuleInput): string | null {
  if (!input.customerId) return "缺少客户 id";
  if (input.ruleType !== "A" && input.ruleType !== "B") return "规则类型无效";
  if (!input.splitEndDate) return "请填写分账截止日期";
  if (!Number.isFinite(input.fixedFeeRate) || input.fixedFeeRate < 0 || input.fixedFeeRate > 1) {
    return "固费分账比例需在 0~100% 之间";
  }
  if (input.ruleType === "A") {
    const r = input.commissionRate;
    if (r === null || r === undefined || !Number.isFinite(r) || r < 0 || r > 1) {
      return "佣金分账比例需在 0~100% 之间";
    }
  } else {
    const list = parseTieredRules(input.tieredRules ?? []);
    if (list.length === 0) return "请至少配置一档阶梯比例";
  }
  return null;
}

/** Upsert the (single) split rule for a customer. Triggers auto-create for any
 * already-signed contract that hasn't been wired to a rule yet. */
export async function upsertChannelSplitRule(input: SplitRuleInput): Promise<Result<{ id: string }>> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权操作" };
  const err = validateInput(input);
  if (err) return { ok: false, error: err };

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, deletedAt: true, channelUserId: true },
  });
  if (!customer || customer.deletedAt) return { ok: false, error: "客户不存在" };

  const data = {
    customerId: input.customerId,
    ruleType: input.ruleType,
    splitEndDate: new Date(input.splitEndDate),
    fixedFeeRate: input.fixedFeeRate,
    commissionRate: input.ruleType === "A" ? (input.commissionRate ?? null) : null,
    tieredRules: input.ruleType === "B"
      ? JSON.stringify(parseTieredRules(input.tieredRules ?? []))
      : "[]",
    createdById: session.userId,
  };

  const existing = await prisma.channelSplitRule.findUnique({ where: { customerId: input.customerId } });
  const rule = existing
    ? await prisma.channelSplitRule.update({ where: { id: existing.id }, data })
    : await prisma.channelSplitRule.create({ data });

  // After (re)configuring rule, back-fill any signed contracts that lack a rule-driven reconciliation.
  if (customer.channelUserId) {
    const signedContracts = await prisma.contract.findMany({
      where: { customerId: input.customerId, status: "COMPLETED", deletedAt: null },
      select: { id: true },
    });
    for (const c of signedContracts) {
      await ensureReconciliationForContract({
        contractId: c.id,
        customerId: input.customerId,
        channelUserId: customer.channelUserId,
        createdById: session.userId,
      });
    }
  }

  revalidatePath(`/customers/${input.customerId}`);
  revalidatePath("/finance");
  return { ok: true, data: { id: rule.id } };
}

export async function deleteChannelSplitRule(customerId: string): Promise<Result> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可删除分账规则" };
  await prisma.channelSplitRule.deleteMany({ where: { customerId } });
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

/** Idempotent. Ensures a rule-driven ChannelReconciliation exists for (contract, splitRule).
 * If the customer has no rule, falls back to a single stub (matches legacy behavior). */
export async function ensureReconciliationForContract(args: {
  contractId: string;
  customerId: string;
  channelUserId: string;
  createdById: string;
}): Promise<Result<{ reconciliationId: string }>> {
  const { contractId, customerId, channelUserId, createdById } = args;

  // Already wired (rule-driven or stub) for this contract? Skip.
  const existing = await prisma.channelReconciliation.findFirst({
    where: { contractId, autoCreated: true },
    select: { id: true },
  });
  if (existing) return { ok: true, data: { reconciliationId: existing.id } };

  const rule = await prisma.channelSplitRule.findUnique({ where: { customerId } });

  // No rule configured -> legacy stub (preserve current markCompleted behavior).
  if (!rule) {
    const r = await prisma.channelReconciliation.create({
      data: {
        customerId,
        contractId,
        channelUserId,
        autoCreated: true,
        createdById,
      },
    });
    return { ok: true, data: { reconciliationId: r.id } };
  }

  // Rule-driven: generate main record + N period rows.
  const start = new Date();
  const end = rule.splitEndDate;
  const periods = splitPeriodsByMonth(start, end);

  const main = await prisma.channelReconciliation.create({
    data: {
      customerId,
      contractId,
      channelUserId,
      autoCreated: true,
      splitRuleId: rule.id,
      periodNo: 1,
      periodStart: start,
      periodEnd: end,
      periodType: "monthly",
      totalPeriods: periods.length,
      fixedFeeShareRate: rule.fixedFeeRate,
      commissionShareRate: rule.ruleType === "A" ? (rule.commissionRate ?? 0) : 0,
      createdById,
    },
  });

  if (periods.length > 0) {
    await prisma.channelReconciliationPeriod.createMany({
      data: periods.map((p) => ({
        reconciliationId: main.id,
        periodIndex: p.periodIndex,
        periodLabel: p.monthLabel,
      })),
    });
  }

  return { ok: true, data: { reconciliationId: main.id } };
}
