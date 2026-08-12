import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/appError";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { daysRemaining } from "@/lib/reconciliationTrash";

// POST /api/finance/reconciliations/[id]/restore
// 恢复已软删除的月度对账（7 天内有效）
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "MANAGE", req);
    const { id } = await params;
    const existing = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
    });
    if (!existing) {
      return NextResponse.json({ error: "客户对账记录不存在、已删除或无权恢复" }, { status: 404 });
    }
    if (!existing.deletedAt) {
      return NextResponse.json(
        { error: "该记录未被删除" },
        { status: 400 },
      );
    }
    if (daysRemaining(existing.deletedAt) <= 0) {
      return NextResponse.json(
        { error: "已超过 7 天保留期，无法恢复" },
        { status: 400 },
      );
    }

    await prisma.customerReconciliation.update({
      where: { id },
      data: { deletedAt: null },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.reconciliation.restore");
  }
}
