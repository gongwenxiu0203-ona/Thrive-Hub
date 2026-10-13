import { prisma } from "../src/lib/prisma";

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

function financialRelationCount(row: {
  _count: Record<string, number>;
}) {
  return Object.values(row._count).reduce((sum, count) => sum + count, 0);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const expectedArg = process.argv.find((arg) => arg.startsWith("--expect="));
  const expectedCount = expectedArg ? Number(expectedArg.slice("--expect=".length)) : null;
  const rows = await prisma.customerReconciliation.findMany({
    where: { deletedAt: null, status: "DRAFT", planStatus: { not: "CANCELLED" } },
    select: {
      id: true, contractId: true, reconcileType: true, periodStart: true, periodEnd: true,
      source: true, automationKey: true, feeAmount: true, createdAt: true,
      contract: { select: { contractNo: true } },
      _count: { select: {
        reviews: true, settlements: true, channelReconciliations: true, invoiceLinks: true,
        billingRequestLines: true, billingAllocations: true, receiptAllocations: true,
        channelPayableSources: true,
      } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const duplicateGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = [row.contractId, row.reconcileType, day(row.periodStart), day(row.periodEnd)].join("|");
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), row]);
  }

  const reasons = new Map<string, string>();
  const blocked: Array<{ id: string; contractNo: string; reason: string }> = [];
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    const keeper = [...group].sort((a, b) => {
      const sourceRank = (value: string) => value === "MANUAL" ? 0 : value === "ADJUSTMENT" ? 1 : 2;
      return sourceRank(a.source) - sourceRank(b.source) || a.createdAt.getTime() - b.createdAt.getTime();
    })[0];
    for (const row of group) {
      if (row.id === keeper.id) continue;
      if (row.source !== "AUTO" || financialRelationCount(row) > 0) {
        blocked.push({ id: row.id, contractNo: row.contract.contractNo, reason: "重复记录已有人工来源或财务关联，保留并要求人工复核" });
        continue;
      }
      reasons.set(row.id, `清理重复自动对账计划；保留记录 ${keeper.id}`);
    }
  }

  for (const row of rows) {
    if (row.reconcileType !== "FEE_ONLY" || row.feeAmount > 0 || reasons.has(row.id)) continue;
    if (row.source !== "AUTO" || financialRelationCount(row) > 0) {
      blocked.push({ id: row.id, contractNo: row.contract.contractNo, reason: "零固费记录已有人工来源或财务关联，保留并要求人工复核" });
      continue;
    }
    reasons.set(row.id, "清理未约定有效固费却生成的自动固费对账计划");
  }

  const candidates = rows.filter((row) => reasons.has(row.id)).map((row) => ({
    id: row.id,
    contractNo: row.contract.contractNo,
    type: row.reconcileType,
    period: `${day(row.periodStart)} ~ ${day(row.periodEnd)}`,
    source: row.source,
    reason: reasons.get(row.id)!,
  }));
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "PREVIEW", candidateCount: candidates.length, candidates, blockedCount: blocked.length, blocked }, null, 2));

  if (!apply) {
    console.log(`Preview only. Re-run with --apply --expect=${candidates.length} after reviewing the list and backing up production.`);
    return;
  }
  if (!Number.isInteger(expectedCount) || expectedCount !== candidates.length) {
    throw new Error(`Candidate count changed or missing: expected ${expectedCount}, current ${candidates.length}. Run preview again.`);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const candidate of candidates) {
      const result = await tx.customerReconciliation.updateMany({
        where: {
          id: candidate.id, deletedAt: null, status: "DRAFT", planStatus: { not: "CANCELLED" },
          reviews: { none: {} }, settlements: { none: {} }, channelReconciliations: { none: {} },
          invoiceLinks: { none: {} }, billingRequestLines: { none: {} }, billingAllocations: { none: {} },
          receiptAllocations: { none: {} }, channelPayableSources: { none: {} },
        },
        data: { deletedAt: now, planStatus: "CANCELLED", adjustmentReason: candidate.reason, updatedAt: now },
      });
      if (result.count !== 1) throw new Error(`Record ${candidate.id} changed after preview. Transaction rolled back.`);
    }
  });
  console.log(JSON.stringify({ softDeletedCount: candidates.length }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
