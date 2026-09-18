import type { Prisma } from "@prisma/client";

export const SHALLOW_FINANCE_EMAIL = "shallow.w@thraiveagency.com";

export async function requireShallowFinanceReviewer(tx: Prisma.TransactionClient) {
  const reviewer = await tx.user.findFirst({
    where: {
      status: "APPROVED",
      OR: [
        { email: SHALLOW_FINANCE_EMAIL },
        { email: { contains: "shallow" } },
        { name: { contains: "Shallow" } },
      ],
    },
    orderBy: { email: "asc" },
    select: { id: true, name: true, email: true },
  });
  if (!reviewer) {
    throw new Error(`未找到已启用的财务初审人 ${SHALLOW_FINANCE_EMAIL}，申请未提交。请管理员先创建或启用该账号。`);
  }
  return reviewer;
}

export async function createTwoStageFinanceApproval(
  tx: Prisma.TransactionClient,
  entityType: "BILLING_REQUEST" | "PAYMENT_REQUEST" | "EXPENSE_CLAIM",
  entityId: string,
  reviewerId?: string,
) {
  const shallow = reviewerId
    ? await tx.user.findFirst({
        where: { id: reviewerId, status: "APPROVED", role: { in: ["ADMIN", "USER"] } },
        select: { id: true, name: true, email: true },
      })
    : await requireShallowFinanceReviewer(tx);
  if (!shallow) throw new Error("所选审核人不存在、未启用或不是内部账号。");
  await tx.financeApprovalStep.createMany({
    data: [
      { entityType, entityId, stepNo: 1, stepType: "SHALLOW_REVIEW", assigneeId: shallow.id, status: "PENDING" },
      { entityType, entityId, stepNo: 2, stepType: "FINANCE_PROCESSING", status: "PENDING", comment: `等待 ${shallow.name || shallow.email} 初审通过` },
    ],
  });
  return shallow;
}

export function normalizeFinanceUrls(value: string | string[] | null | undefined): string[] {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[,\n]/);
  return [...new Set(values.map((item) => item.trim()).filter((item) => item.startsWith("/uploads/") || /^https:\/\//i.test(item)))].slice(0, 50);
}
