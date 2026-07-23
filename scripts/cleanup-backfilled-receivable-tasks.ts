import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiTodayUtc(): Date {
  const nowInShanghai = new Date(Date.now() + SHANGHAI_OFFSET_MS);
  return new Date(Date.UTC(
    nowInShanghai.getUTCFullYear(),
    nowInShanghai.getUTCMonth(),
    nowInShanghai.getUTCDate(),
  ));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const expectedArg = process.argv.find((arg) => arg.startsWith("--expect="));
  const expectedCount = expectedArg
    ? Number(expectedArg.slice("--expect=".length))
    : null;
  const today = shanghaiTodayUtc();
  const baseWhere: Prisma.TaskWhereInput = {
    automationKey: { startsWith: "receivable:" },
    category: { in: ["RECEIVABLE_MONTHLY_FEE", "RECEIVABLE_GMV"] },
    dueDate: { lt: today },
    deletedAt: null,
  };
  const taskSelect = {
    id: true,
    title: true,
    status: true,
    dueDate: true,
    owner: { select: { id: true, name: true } },
  } satisfies Prisma.TaskSelect;

  const [candidates, preserved] = await Promise.all([
    prisma.task.findMany({
      where: { ...baseWhere, status: "TODO" },
      select: taskSelect,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }),
    prisma.task.findMany({
      where: { ...baseWhere, status: { not: "TODO" } },
      select: taskSelect,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }),
  ]);

  const formatTask = (task: (typeof candidates)[number]) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
    owner: task.owner,
  });

  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "PREVIEW",
    shanghaiToday: today.toISOString().slice(0, 10),
    candidateCount: candidates.length,
    candidates: candidates.map(formatTask),
    preservedCount: preserved.length,
    preserved: preserved.map(formatTask),
  }, null, 2));

  if (!apply) {
    console.log(
      `Preview only. Re-run with --apply --expect=${candidates.length} to soft-delete exactly these TODO tasks.`,
    );
    return;
  }

  if (!Number.isInteger(expectedCount)) {
    throw new Error("--apply requires an integer --expect=N from the latest preview.");
  }

  const softDeletedCount = await prisma.$transaction(async (tx) => {
    const currentCandidates = await tx.task.findMany({
      where: { ...baseWhere, status: "TODO" },
      select: { id: true },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });

    if (currentCandidates.length !== expectedCount) {
      throw new Error(
        `Candidate count changed: expected ${expectedCount}, current ${currentCandidates.length}. Run preview again.`,
      );
    }

    if (currentCandidates.length === 0) return 0;
    const ids = currentCandidates.map((task) => task.id);
    const result = await tx.task.updateMany({
      where: {
        ...baseWhere,
        id: { in: ids },
        status: "TODO",
      },
      data: { deletedAt: new Date() },
    });

    if (result.count !== expectedCount) {
      throw new Error(
        `Soft-delete count changed: expected ${expectedCount}, updated ${result.count}. Transaction rolled back.`,
      );
    }
    return result.count;
  });

  console.log(JSON.stringify({ softDeletedCount }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
