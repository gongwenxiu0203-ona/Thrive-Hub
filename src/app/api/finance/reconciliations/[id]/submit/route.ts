import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// POST /api/finance/reconciliations/[id]/submit
// 提交对账，状态变为 PENDING_REVIEW，通知客户负责人
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const note = body.note ?? "";

    const rec = await prisma.customerReconciliation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, brandName: true, businessOwnerId: true } },
      },
    });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rec.status !== "DRAFT") {
      return NextResponse.json({ error: "只有草稿状态可以提交对账" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 更新状态
      await tx.customerReconciliation.update({
        where: { id },
        data: {
          status: "PENDING_REVIEW",
          submittedById: session.userId,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
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

      // 给客户负责人创建提醒
      if (rec.customer.businessOwnerId) {
        const periodStr = `${rec.periodStart.toISOString().slice(0, 7)}`;
        await tx.reminder.create({
          data: {
            title: `【对账审核】${rec.customer.brandName} ${periodStr} 月度对账待确认`,
            content: `${rec.customer.brandName} 的 ${periodStr} 月度对账已提交，请确认实际单量和销售额。`,
            remindDate: new Date(),
            type: "RECONCILIATION_REVIEW",
            targetId: rec.customer.businessOwnerId,
            createdById: session.userId,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "提交失败" }, { status: 500 });
  }
}
