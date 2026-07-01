import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { daysRemaining } from "@/lib/reconciliationTrash";

// POST /api/finance/reconciliations/[id]/restore
// 恢复已软删除的月度对账（7 天内有效）
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (!isStaff(session.role)) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.customerReconciliation.findUnique({
      where: { id },
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
    console.error(e);
    return NextResponse.json({ error: "恢复失败" }, { status: 500 });
  }
}
