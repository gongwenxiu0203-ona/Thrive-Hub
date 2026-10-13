import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { readReconciliationConfirmation } from "../src/lib/reconciliationConfirmation";
import { hasBillableFixedFee } from "../src/lib/reconciliationGenerationRules";

type Row = Awaited<ReturnType<typeof loadRows>>[number];
type Candidate = { id: string; contractNo: string; key: string; reason: string; updatedAt: string };
type Blocked = { id: string; contractNo: string; reason: string };
type Keeper = { id: string; contractNo: string; key: string; reason: string };

function day(value: Date) { return value.toISOString().slice(0, 10); }
function keyOf(row: Row) {
  return [row.contractId, row.projectConfirmationId ?? "LEGACY", row.reconcileType, day(row.periodStart), day(row.periodEnd)].join("|");
}
function relationCount(row: Row) { return Object.values(row._count).reduce((sum, count) => sum + count, 0); }
function deletionIssue(row: Row): string | null {
  if (row.projectConfirmationId && !readReconciliationConfirmation(row)) return "项目确认书计费快照缺失，需人工复核";
  if (row.status !== "DRAFT") return `状态 ${row.status} 不是草稿`;
  if (row.submittedAt || row.submittedById || row.submittedToUserId) return "曾提交审核";
  if (row.planStatus === "CANCELLED") return "计划已作废";
  if (relationCount(row)) return "存在审核、周期审计或财务关联";
  return null;
}
function completeness(row: Row) {
  return [row.ruleSnapshot, row.projectConfirmationId, row.automationKey, row.partyA,
    row.accountingPeriod, row.feeCycle, row.affiliateRule, row.paymentCycle,
    row.adjustmentReason, row.openedAt, row.submittedAt, row.finalFeeAmount,
    row.finalSalesAmount, row.finalCommissionAmount].filter((value) => value !== null && value !== undefined && value !== "").length
    + (row.actualSalesAmount !== 0 ? 1 : 0) + (row.actualOrders !== 0 ? 1 : 0);
}
function compareKeeper(a: Row, b: Row) {
  const status = (value: string) => ({ CONFIRMED: 4, DISPUTED: 3, PENDING_REVIEW: 2, DRAFT: 1 } as Record<string, number>)[value] ?? 0;
  const rank = (row: Row) => [relationCount(row) > 0 ? 1 : 0, status(row.status), completeness(row), row.updatedAt.getTime(), row.createdAt.getTime()];
  const left = rank(a), right = rank(b);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return right[i] - left[i];
  return a.id.localeCompare(b.id);
}
function noFixedFeeIssue(row: Row): string | null {
  if (row.reconcileType !== "FEE_ONLY") return null;
  if (row.projectConfirmationId) {
    const snapshot = readReconciliationConfirmation(row);
    if (!snapshot) return "项目确认书有效计费快照缺失，不能自动判定固费条款";
    return snapshot.monthlyFee && snapshot.monthlyFee.amount > 0 ? null : "确认书未约定有效固费";
  }
  if (!row.contract) return "关联合同缺失，不能自动判定固费条款";
  return hasBillableFixedFee(row.contract) ? null : "合同未约定有效固费";
}

export function planCleanup(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const reasons = new Map<string, string>();
  const blocked: Blocked[] = [];
  const keepers: Keeper[] = [];
  const blockedGroups = new Set<string>();
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    if (group.some((row) => row.projectConfirmationId && !readReconciliationConfirmation(row))) {
      blockedGroups.add(key);
      for (const row of group) blocked.push({ id: row.id, contractNo: row.contract?.contractNo ?? "?", reason: `重复组 ${key} 存在项目确认书计费快照缺失，整组人工复核` });
      continue;
    }
    const protectedRows = group.filter((row) => deletionIssue(row));
    if (protectedRows.length > 1) {
      blockedGroups.add(key);
      for (const row of group) blocked.push({ id: row.id, contractNo: row.contract?.contractNo ?? "?", reason: `重复组 ${key} 包含多个受保护记录，整组人工复核` });
      continue;
    }
    const keeper = [...group].sort(compareKeeper)[0];
    if (protectedRows.length === 1 && protectedRows[0].id !== keeper.id) {
      blockedGroups.add(key);
      for (const row of group) blocked.push({ id: row.id, contractNo: row.contract?.contractNo ?? "?", reason: `重复组 ${key} 受保护记录并非最完整记录，整组人工复核` });
      continue;
    }
    keepers.push({ id: keeper.id, contractNo: keeper.contract?.contractNo ?? "?", key, reason: "保留状态/信息最完整、较新的记录" });
    for (const row of group) {
      if (row.id === keeper.id) continue;
      const issue = deletionIssue(row);
      if (issue) blocked.push({ id: row.id, contractNo: row.contract?.contractNo ?? "?", reason: `重复记录不可自动清理：${issue}` });
      else reasons.set(row.id, `重复对账；保留 ${keeper.id}`);
    }
  }
  for (const row of rows) {
    if (row.reconcileType !== "FEE_ONLY" || reasons.has(row.id)) continue;
    if (blockedGroups.has(keyOf(row))) continue;
    const issue = noFixedFeeIssue(row);
    if (!issue) continue;
    if (issue.includes("缺失")) { blocked.push({ id: row.id, contractNo: row.contract?.contractNo ?? "?", reason: issue }); continue; }
    const protection = deletionIssue(row);
    if (protection) blocked.push({ id: row.id, contractNo: row.contract?.contractNo ?? "?", reason: `${issue}，但${protection}` });
    else reasons.set(row.id, issue);
  }
  const candidates: Candidate[] = rows.filter((row) => reasons.has(row.id)).map((row) => ({
    id: row.id, contractNo: row.contract?.contractNo ?? "?", key: keyOf(row),
    reason: reasons.get(row.id)!, updatedAt: row.updatedAt.toISOString(),
  })).sort((a, b) => a.id.localeCompare(b.id));
  const digest = createHash("sha256").update(JSON.stringify({ candidates, keepers, blocked })).digest("hex");
  return { candidates, keepers, blocked, digest };
}

async function loadRows(db: typeof prisma) {
  return db.customerReconciliation.findMany({
    where: { deletedAt: null },
    select: {
      id: true, contractId: true, projectConfirmationId: true, ruleSnapshot: true,
      reconcileType: true, periodStart: true, periodEnd: true, source: true,
      status: true, planStatus: true, submittedAt: true, submittedById: true,
      submittedToUserId: true, automationKey: true, feeAmount: true, createdAt: true,
      updatedAt: true, partyA: true, accountingPeriod: true, feeCycle: true,
      affiliateRule: true, paymentCycle: true, adjustmentReason: true, openedAt: true,
      finalFeeAmount: true, finalSalesAmount: true, finalCommissionAmount: true,
      actualSalesAmount: true, actualOrders: true,
      contract: { select: { contractNo: true, feeCycle: true, feeAmount: true } },
      _count: { select: {
        reviews: true, settlements: true, channelReconciliations: true, invoiceLinks: true,
        periodAudits: true, billingRequestLines: true, billingAllocations: true,
        receiptAllocations: true, channelPayableSources: true,
      } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const countArg = process.argv.find((arg) => arg.startsWith("--expect="));
  const digestArg = process.argv.find((arg) => arg.startsWith("--digest="));
  const plan = planCleanup(await loadRows(prisma));
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "PREVIEW", candidateCount: plan.candidates.length,
    digest: plan.digest, candidates: plan.candidates, keepers: plan.keepers,
    blockedCount: plan.blocked.length, blocked: plan.blocked,
    warning: "软删除后 7 天会被物理清理；执行前必须独立备份并人工核对候选。" }, null, 2));
  if (!apply) return;
  const expected = countArg ? Number(countArg.slice("--expect=".length)) : NaN;
  const expectedDigest = digestArg?.slice("--digest=".length);
  if (!Number.isInteger(expected) || expected !== plan.candidates.length || expectedDigest !== plan.digest)
    throw new Error("候选数量或摘要不匹配；请重新预览并核对后传入 --expect=N --digest=SHA256。");
  if (!plan.candidates.length) return;
  await prisma.$transaction(async (tx) => {
    const current = planCleanup(await loadRows(tx as typeof prisma));
    if (current.candidates.length !== expected || current.digest !== expectedDigest)
      throw new Error("执行前对账记录或合同条款已变化，事务已回滚；请重新预览。");
    const now = new Date();
    for (const candidate of current.candidates) {
      const changed = await tx.customerReconciliation.updateMany({
        where: { id: candidate.id, deletedAt: null, status: "DRAFT", submittedAt: null,
          submittedById: null, submittedToUserId: null, planStatus: { not: "CANCELLED" },
          reviews: { none: {} }, settlements: { none: {} }, channelReconciliations: { none: {} },
          invoiceLinks: { none: {} }, periodAudits: { none: {} }, billingRequestLines: { none: {} },
          billingAllocations: { none: {} }, receiptAllocations: { none: {} }, channelPayableSources: { none: {} } },
        data: { deletedAt: now, planStatus: "CANCELLED", adjustmentReason: candidate.reason, updatedAt: now },
      });
      if (changed.count !== 1) throw new Error(`记录 ${candidate.id} 状态变化，事务已回滚。`);
    }
  }, { timeout: 120_000 });
  console.log(JSON.stringify({ softDeletedCount: plan.candidates.length, warning: "7 天后物理清理" }));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
