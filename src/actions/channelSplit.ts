"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { channelReconciliationScope, customerScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import {
  splitPeriodsByMonth,
  parseTieredRules,
  addWorkdays,
  type PeriodDerived,
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
  try {
    await requireFeaturePermission(session, "finance.channel_reconciliation", "EDIT");
  } catch (error) {
    if (error instanceof FeaturePermissionError) return { ok: false, error: "无权操作" };
    throw error;
  }
  const err = validateInput(input);
  if (err) return { ok: false, error: err };

  const customer = await prisma.customer.findFirst({
    where: { AND: [{ id: input.customerId }, customerScope(session, session.role === "ADMIN" ? "all" : "mine")] },
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
  try {
    await requireFeaturePermission(session, "finance.channel_reconciliation", "MANAGE");
  } catch (error) {
    if (error instanceof FeaturePermissionError) return { ok: false, error: "无权删除分账规则" };
    throw error;
  }
  const customer = await prisma.customer.findFirst({ where: { AND: [{ id: customerId }, customerScope(session, session.role === "ADMIN" ? "all" : "mine")] }, select: { id: true } });
  if (!customer) return { ok: false, error: "客户不存在或无权操作" };
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
  const session = await requireSession();
  await requireFeaturePermission(session, "finance.channel_reconciliation", "EDIT");
  const { contractId, customerId, channelUserId } = args;
  const relation = await prisma.contract.findFirst({
    where: {
      id: contractId,
      customerId,
      deletedAt: null,
      customer: {
        ...customerScope(session, session.role === "ADMIN" ? "all" : "mine"),
        channelUserId,
        deletedAt: null,
      },
    },
    select: { id: true },
  });
  if (!relation) return { ok: false, error: "合同、客户或渠道归属不匹配" };
  const createdById = session.userId;

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
  // 开始时间 = 合同开始时间（contract.startDate）；如果合同未填写则回退到今天。
  const contractRow = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { startDate: true },
  });
  const start = contractRow?.startDate ?? new Date();
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

// Cache the Shallow user id at module level (cheap re-lookup ok if missing).
async function findShallowUser(): Promise<{ id: string; name: string } | null> {
  const u = await prisma.user.findFirst({
    where: {
      OR: [
        { email: "shallow@demo.com" },
        { name: { contains: "Shallow" } },
        { name: { contains: "shallow" } },
      ],
    },
    select: { id: true, name: true },
  });
  return u;
}

/**
 * For each derived period that has a dueDate, ensure there is a Reminder
 * targeting Shallow for "1 workday before dueDate". Idempotent: skips when
 * an equivalent reminder already exists (matched by title+target).
 *
 * Called lazily from the detail page render. Errors here are swallowed by
 * the caller — must not crash the page.
 */
export async function ensureChannelDueDateReminders(
  reconciliationId: string,
  derivedPeriods: PeriodDerived[]
): Promise<void> {
  const session = await requireSession();
  await requireFeaturePermission(session, "finance.channel_reconciliation", "READ");
  const reconciliation = await prisma.channelReconciliation.findFirst({
    where: {
      id: reconciliationId,
      ...channelReconciliationScope(session, session.role === "ADMIN" ? "all" : "mine"),
    },
    select: { id: true },
  });
  if (!reconciliation) throw new Error("渠道对账不存在或无权访问");
  const due = derivedPeriods.filter((p) => p.dueDate);
  if (due.length === 0) return;

  const shallow = await findShallowUser();
  if (!shallow) return; // No target user — silently skip

  for (const p of due) {
    if (!p.dueDate) continue;
    const remindAt = addWorkdays(new Date(p.dueDate), -1);
    const title = `渠道商分账付款提醒 · ${p.monthLabel}（第${p.periodIndex}期）`;

    // De-dupe by (target, title) within this reconciliation
    const existing = await prisma.reminder.findFirst({
      where: { targetId: shallow.id, title, deletedAt: null },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.reminder.create({
      data: {
        title,
        content: `渠道商分账 ${reconciliationId} 的第 ${p.periodIndex} 期（${p.monthLabel}）付款截止 ${new Date(p.dueDate).toISOString().slice(0, 10)}（Thraive 实收+7工作日）。请于截止前完成对渠道商的付款。`,
        remindDate: remindAt,
        type: "REVIEW",
        targetId: shallow.id,
        createdById: shallow.id, // system-generated; attribute to Shallow as a self-task
      },
    });
  }
}
