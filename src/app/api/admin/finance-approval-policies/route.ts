import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession, adminHasFeature } from "@/lib/session";
import { AppError, errorResponse } from "@/lib/appError";

const kinds = ["BILLING_REQUEST", "PAYMENT_REQUEST", "EXPENSE_CLAIM"] as const;
async function authorize(level: "READ" | "MANAGE") {
  const session = await getSession();
  if (!session) throw new AppError("请重新登录", 401, "AUTH_REQUIRED");
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, status: true } });
  if (user?.role !== "ADMIN" || user.status !== "APPROVED" || !await adminHasFeature(session, "admin.permissions", level))
    throw new AppError("仅有权限的管理员可管理财务审批配置", 403, "PERMISSION_DENIED");
  return session;
}
export async function GET() {
  try {
    await authorize("READ");
    const [users, saved] = await Promise.all([
      prisma.user.findMany({ where: { status: "APPROVED", role: { in: ["ADMIN", "USER"] } }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
      prisma.financeApprovalPolicy.findMany(),
    ]);
    const fallback = users.find(user => user.email.toLowerCase() === "shallow.w@thraiveagency.com");
    return NextResponse.json({ users, policies: kinds.map(entityType => {
      const policy = saved.find(row => row.entityType === entityType);
      return { entityType, reviewRequired: policy?.reviewRequired ?? true, defaultReviewerId: policy?.defaultReviewerId ?? (policy ? "" : fallback?.id ?? ""), defaultProcessorId: policy?.defaultProcessorId ?? "", version: policy?.version ?? 0 };
    }) });
  } catch (error) { return errorResponse(error, "admin.finance-approval.read"); }
}
export async function PUT(request: Request) {
  try {
    const session = await authorize("MANAGE");
    const body = await request.json().catch(() => null);
    if (!Array.isArray(body?.policies) || body.policies.length !== kinds.length)
      throw new AppError("请提交三类财务流程的完整配置", 400, "INVALID_POLICY");
    const seen = new Set<string>();
    const policies = body.policies.map((raw: Record<string, unknown>) => {
      if (!raw || !kinds.includes(raw.entityType as typeof kinds[number]) || seen.has(String(raw.entityType)) || typeof raw.reviewRequired !== "boolean" || !Number.isInteger(raw.version) || Number(raw.version) < 0)
        throw new AppError("审批配置格式不正确", 400, "INVALID_POLICY");
      seen.add(String(raw.entityType));
      const id = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
      const result = { entityType: String(raw.entityType), reviewRequired: raw.reviewRequired, defaultReviewerId: raw.reviewRequired ? id(raw.defaultReviewerId) : null, defaultProcessorId: id(raw.defaultProcessorId), version: Number(raw.version) };
      if (result.reviewRequired && !result.defaultReviewerId) throw new AppError("需要审核时必须选择默认审核人", 400, "REVIEWER_REQUIRED");
      return result;
    });
    await prisma.$transaction(async tx => {
      for (const policy of policies) {
        for (const userId of [policy.defaultReviewerId, policy.defaultProcessorId].filter((id): id is string => Boolean(id))) {
          if (!await tx.user.findFirst({ where: { id: userId, status: "APPROVED", role: { in: ["ADMIN", "USER"] } }, select: { id: true } }))
            throw new AppError("所选账号不是已启用的内部账号，请重新选择", 400, "INVALID_REVIEWER");
        }
        const current = await tx.financeApprovalPolicy.findUnique({ where: { entityType: policy.entityType } });
        if ((current?.version ?? 0) !== policy.version) throw new AppError("配置已被其他管理员修改，请刷新后重试", 409, "POLICY_CONFLICT");
        const { version, ...data } = policy;
        if (current) {
          const updated = await tx.financeApprovalPolicy.updateMany({ where: { id: current.id, version }, data: { ...data, version: { increment: 1 }, updatedById: session.userId } });
          if (updated.count !== 1) throw new AppError("配置已变化，请刷新后重试", 409, "POLICY_CONFLICT");
        } else await tx.financeApprovalPolicy.create({ data: { ...data, updatedById: session.userId } });
        await tx.financeAuditLog.create({ data: { entityType: "FINANCE_APPROVAL_POLICY", entityId: data.entityType, actorId: session.userId, action: "UPDATE_APPROVAL_POLICY", note: "修改财务流程默认审批配置，不修改在途申请", metadata: JSON.stringify({ before: current, after: { ...data, version: version + 1 } }) } });
      }
    });
    revalidatePath("/admin"); revalidatePath("/finance/workbench");
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error, "admin.finance-approval.write"); }
}
