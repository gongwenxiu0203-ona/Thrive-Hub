import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireFeaturePermission, FeaturePermissionError } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "仅管理员可以恢复作废的客户对账" }, { status: 403 });
    }
    await requireFeaturePermission(session, "finance.customer_reconciliation", "MANAGE");
    const body = await req.json();
    const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : [];
    const ids: string[] = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!ids.length) return NextResponse.json({ error: "请选择需要恢复的作废记录" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "请填写恢复原因" }, { status: 400 });

    const records = await prisma.customerReconciliation.findMany({
      where: { id: { in: ids }, deletedAt: null, planStatus: "CANCELLED" },
      include: { customer: { select: { status: true, cooperationEndDate: true } } },
    });
    if (records.length !== ids.length) {
      return NextResponse.json({ error: "部分记录不存在或当前不是作废状态" }, { status: 409 });
    }
    const invalid = records.find((record) =>
      record.customer.status === "COOPERATION_DONE"
      && record.customer.cooperationEndDate
      && record.periodStart > record.customer.cooperationEndDate,
    );
    if (invalid) {
      return NextResponse.json({ error: "所选记录中有周期晚于客户合作结束日期的记录，请先调整客户合作状态或结束日期" }, { status: 409 });
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await prisma.$transaction(async (tx) => {
      for (const record of records) {
        const nextStatus = record.periodStart <= today ? "OPEN" : "PLANNED";
        await tx.customerReconciliation.update({
          where: { id: record.id },
          data: {
            planStatus: nextStatus,
            openedAt: nextStatus === "OPEN" ? now : null,
            adjustmentReason: `管理员恢复作废记录：${reason}`,
          },
        });
        await tx.financeAuditLog.create({
          data: {
            entityType: "CUSTOMER_RECONCILIATION",
            entityId: record.id,
            action: "RESTORE_CANCELLED_PLAN",
            actorId: session.userId,
            fromStatus: "CANCELLED",
            toStatus: nextStatus,
            note: reason,
          },
        });
      }
    });
    return NextResponse.json({ success: true, restored: records.length });
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return errorResponse(error, "finance.reconciliation.restore-cancelled");
  }
}
