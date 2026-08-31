import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";
import { assertConfirmationReadyForSubmission } from "@/lib/reconciliationCalc";

// POST /api/finance/reconciliations/[id]/submit
// 提交对账，状态变为 PENDING_REVIEW，通知指定审核人（或客户负责人）
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "EDIT", req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const note = body.note ?? "";
    const submittedToUserId: string | undefined = body.submittedToUserId;
    const submittedDeadline: string | undefined = body.submittedDeadline;

    const rec = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: {
        customer: { select: { id: true, brandName: true, businessOwnerId: true } },
      },
    });
    if (!rec) return NextResponse.json({ error: "客户对账记录不存在、已删除或无权访问" }, { status: 404 });
    assertConfirmationReadyForSubmission(rec);
    if (rec.status !== "DRAFT" && rec.status !== "DISPUTED") {
      return NextResponse.json({ error: "只有草稿或争议状态可以提交对账" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 更新状态，保存提交目标用户和截止时间
      const updateData: Record<string, unknown> = {
        status: "PENDING_REVIEW",
        submittedById: session.userId,
        submittedAt: new Date(),
        updatedAt: new Date(),
      };
      if (submittedToUserId) updateData.submittedToUserId = submittedToUserId;
      if (submittedDeadline) updateData.submittedDeadline = new Date(submittedDeadline);

      await tx.customerReconciliation.update({
        where: { id },
        data: updateData,
      });

      // 写入审核记录
      await tx.reconciliationReview.create({
        data: {
          reconciliationId: id,
          reviewerId: session.userId,
          action: "SUBMITTED",
          note,
          createdAt: new Date(),
        },
      });

      // 给审核目标用户创建提醒（优先 submittedToUserId，否则客户负责人）
      const notifyUserId = submittedToUserId ?? rec.customer.businessOwnerId;
      if (notifyUserId) {
        const periodStr = rec.periodStart.toISOString().slice(0, 7);
        const deadlineStr = submittedDeadline
          ? `，截止时间：${new Date(submittedDeadline).toLocaleDateString("zh-CN")}`
          : "";
        await tx.reminder.create({
          data: {
            title: `【对账审核】${rec.customer.brandName} ${periodStr} 月度对账待确认`,
            content: `${rec.customer.brandName} 的 ${periodStr} 月度对账已提交，请确认实际单量和销售额${deadlineStr}。`,
            remindDate: new Date(),
            type: "RECONCILIATION_REVIEW",
            targetId: notifyUserId,
            createdById: session.userId,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.reconciliation.submit");
  }
}
