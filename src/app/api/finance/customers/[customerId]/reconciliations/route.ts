import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { customerScope, reconciliationScope, financeDataView } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { RECONCILIATION_FEATURE } from "@/lib/reconciliationAccess";
import { errorResponse } from "@/lib/appError";

// DELETE /api/finance/customers/[customerId]/reconciliations
// Soft-delete all customer reconciliation records. Confirmed/settled history is
// retained indefinitely for audit and can only be removed by an administrator.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, RECONCILIATION_FEATURE, "MANAGE");
    const { customerId } = await params;
    const body = await req.json().catch(() => ({}));
    const deletionReason = typeof body.reason === "string" ? body.reason.trim() : "";

    const view = financeDataView(session);
    const customer = await prisma.customer.findFirst({
      where: { AND: [{ id: customerId }, customerScope(session, view)] },
    });
    if (!customer) {
      return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    }

    const records = await prisma.customerReconciliation.findMany({
      where: {
        AND: [{ customerId, deletedAt: null }, reconciliationScope(session, view)],
      },
      select: {
        id: true,
        status: true,
        settlements: { select: { status: true } },
      },
    });
    const hasCompleted = records.some(
      (record) => record.status === "CONFIRMED"
        || record.settlements.some((settlement) => settlement.status === "SETTLED"),
    );
    if (hasCompleted && session.role !== "ADMIN") {
      return NextResponse.json(
        { error: "只有管理员可以删除含已确认或已结算历史的客户对账" },
        { status: 403 },
      );
    }
    if (hasCompleted && !deletionReason) {
      return NextResponse.json(
        { error: "删除含已确认或已结算历史的客户对账必须填写删除原因" },
        { status: 400 },
      );
    }

    const deletedAt = new Date();
    const count = await prisma.$transaction(async (tx) => {
      const result = await tx.customerReconciliation.updateMany({
        where: { id: { in: records.map((record) => record.id) }, deletedAt: null },
        data: { deletedAt },
      });
      if (records.length > 0) {
        await tx.financeAuditLog.createMany({
          data: records.map((record) => ({
            entityType: "CUSTOMER_RECONCILIATION",
            entityId: record.id,
            action: "BATCH_SOFT_DELETE",
            actorId: session.userId,
            fromStatus: record.status,
            toStatus: "DELETED",
            note: deletionReason || null,
            metadata: JSON.stringify({
              customerId,
              completed: record.status === "CONFIRMED"
                || record.settlements.some((settlement) => settlement.status === "SETTLED"),
              settlementStatuses: record.settlements.map((settlement) => settlement.status),
              deletedAt: deletedAt.toISOString(),
            }),
          })),
        });
      }
      return result.count;
    });

    return NextResponse.json({ success: true, deleted: count });
  } catch (e) {
    if (e instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return errorResponse(e, "finance.customer-reconciliations.delete-all");
  }
}
