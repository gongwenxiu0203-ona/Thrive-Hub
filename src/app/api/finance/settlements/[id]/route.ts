import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { reconciliationScope, financeDataView } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";

// PATCH /api/finance/settlements/[id]
// 更新结算记录（预计结算时间、实际结算时间、备注）
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.customer_reconciliation", "EDIT");
    const { id } = await params;
    const body = await req.json();

    const settlement = await prisma.settlement.findFirst({
      where: { id, reconciliation: reconciliationScope(session, financeDataView(session)) },
      include: {
        reconciliation: {
          include: { customer: { select: { brandName: true } } },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!settlement) return NextResponse.json({ error: "结算记录不存在、已删除或无权访问" }, { status: 404 });

    const data: Record<string, unknown> = { updatedAt: new Date() };

    if ("estimatedDate" in body) {
      data.estimatedDate = body.estimatedDate ? new Date(body.estimatedDate) : null;
    }
    if ("actualDate" in body) {
      data.actualDate = body.actualDate ? new Date(body.actualDate) : null;
      // 填写实际结算时间后自动标记已结算
      if (body.actualDate) {
        data.status = "SETTLED";
      } else {
        data.status = "PENDING";
      }
    }
    if ("note" in body) {
      data.note = body.note;
    }

    const updated = await prisma.settlement.update({ where: { id }, data });

    // 设置预计结算时间时，在前一天创建提醒
    if (body.estimatedDate && !settlement.reminderSent) {
      const estimatedDate = new Date(body.estimatedDate);
      const remindDate = new Date(estimatedDate);
      remindDate.setDate(remindDate.getDate() - 1); // 提前 1 天

      const typeLabel = settlement.type === "FIXED_FEE" ? "固费" : "抽佣";
      const customerName = settlement.reconciliation.customer.brandName;

      await prisma.reminder.create({
        data: {
          title: `【结算提醒】${customerName} ${typeLabel}明日到期`,
          content: `${customerName} 的${typeLabel}结算（¥${settlement.amount.toFixed(2)}）预计明日（${estimatedDate.toLocaleDateString("zh-CN")}）收取，请注意跟进。`,
          remindDate,
          type: "SETTLEMENT_DUE",
          targetId: settlement.createdById,
          createdById: session.userId,
        },
      });
      await prisma.settlement.update({ where: { id }, data: { reminderSent: true } });
    }

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.settlement.update");
  }
}
