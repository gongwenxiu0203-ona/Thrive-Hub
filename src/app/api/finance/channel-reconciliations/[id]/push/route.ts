import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { channelReconciliationScope, financeDataView } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";

// POST /api/finance/channel-reconciliations/[id]/push
// body: { side: "FIXED_FEE" | "COMMISSION" }
// 把当前分账（含转账截图）推送给渠道商：创建 Reminder + 标记 pushed
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "MANAGE");
    if (session.role !== "ADMIN" && session.role !== "USER") {
      return NextResponse.json(
        { error: "仅内部员工可推送渠道商分账" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const { side } = await req.json();
    if (side !== "FIXED_FEE" && side !== "COMMISSION") {
      return NextResponse.json({ error: "side 参数错误" }, { status: 400 });
    }

    const rec = await prisma.channelReconciliation.findFirst({
      where: { AND: [{ id }, channelReconciliationScope(session, financeDataView(session))] },
      include: {
        customer: { select: { brandName: true } },
        channelUser: { select: { id: true, name: true } },
        contract: { select: { contractNo: true } },
      },
    });
    if (!rec) {
      return NextResponse.json({ error: "渠道商对账记录不存在、已删除或无权推送" }, { status: 404 });
    }
    if (rec.recordMode === "RULE_DRIVEN") {
      return NextResponse.json(
        { error: "新版分账请在对应服务周期填写向渠道商实际付款时间" },
        { status: 409 },
      );
    }

    const isFixed = side === "FIXED_FEE";
    const amount = isFixed ? rec.fixedFeeShareAmount : rec.commissionShareAmount;
    const currency = isFixed
      ? rec.fixedFeeShareCurrency
      : rec.commissionShareCurrency;
    const proofUrl = isFixed ? rec.fixedFeeProofUrl : rec.commissionProofUrl;
    const sym = currency === "美金" ? "$" : "¥";
    const label = isFixed ? "固费分账" : "抽佣分账";
    const periodStr = rec.periodStart
      ? rec.periodStart.toISOString().slice(0, 7)
      : "";

    await prisma.$transaction(async (tx) => {
      // 创建提醒推送给渠道商
      await tx.reminder.create({
        data: {
          title: `【${label}已发放】${rec.customer.brandName} ${periodStr}`,
          content: `${rec.customer.brandName}（合同 ${rec.contract?.contractNo ?? "—"}）${periodStr} ${label}已发放：${sym}${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}${proofUrl ? `\n转账凭证：${proofUrl}` : ""}`,
          remindDate: new Date(),
          type: "CHANNEL_SHARE_PUSH",
          targetId: rec.channelUser.id,
          createdById: session.userId,
        },
      });

      // 标记 pushed
      await tx.channelReconciliation.update({
        where: { id },
        data: {
          [isFixed ? "fixedFeePushedToChannel" : "commissionPushedToChannel"]:
            true,
          updatedAt: new Date(),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.channel-reconciliation.push");
  }
}
