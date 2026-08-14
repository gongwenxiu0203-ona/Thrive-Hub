import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { customerScope, reconciliationScope, financeDataView } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { RECONCILIATION_FEATURE } from "@/lib/reconciliationAccess";
import { errorResponse } from "@/lib/appError";

// DELETE /api/finance/customers/[customerId]/reconciliations
// 删除该客户的全部月度对账记录（含级联的 settlements/reviews）
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, RECONCILIATION_FEATURE, "MANAGE");
    const { customerId } = await params;

    const view = financeDataView(session);
    const customer = await prisma.customer.findFirst({
      where: { AND: [{ id: customerId }, customerScope(session, view)] },
    });
    if (!customer) {
      return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    }

    // 软删除：标记 deletedAt，7 天内可恢复
    const protectedRecord = await prisma.customerReconciliation.findFirst({
      where: {
        AND: [
          { customerId, deletedAt: null },
          reconciliationScope(session, view),
          {
            OR: [
              { status: "CONFIRMED" },
              { settlements: { some: { status: "SETTLED" } } },
            ],
          },
        ],
      },
      select: { id: true },
    });
    if (protectedRecord) {
      return NextResponse.json({ error: "该客户存在已确认或已结算的财务历史，不能批量删除" }, { status: 409 });
    }
    const { count } = await prisma.customerReconciliation.updateMany({
      where: { AND: [{ customerId, deletedAt: null }, reconciliationScope(session, view)] },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true, deleted: count });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.customer-reconciliations.delete-all");
  }
}
