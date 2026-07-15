import { NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    console.error(e);
    return NextResponse.json({ error: "恢复失败" }, { status: 500 });
  }
}
