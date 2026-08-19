import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/appError";
import { sendTemplateEmail } from "@/lib/emailService";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { isStaff } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

function date(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "Asia/Shanghai" }).format(value);
}

function amount(value: number | null, currency: string | null): string {
  return `${currency || "USD"} ${(value ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "EDIT");
    if (!isStaff(session.role)) {
      throw new AppError("仅内部员工可以发送渠道对账邮件", 403, "PERMISSION_DENIED");
    }
    const { id } = await params;
    const body = await request.json().catch(() => null) as {
      kind?: "REVIEW" | "RESULT";
      periodId?: string;
    } | null;
    if (!body?.kind || !body.periodId) {
      throw new AppError("请选择需要发送的渠道对账期和邮件类型", 400, "CHANNEL_EMAIL_INPUT_INVALID");
    }

    const reconciliation = await prisma.channelReconciliation.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { select: { brandName: true } },
        channelUser: { select: { id: true, name: true, email: true, status: true } },
        createdBy: { select: { id: true, name: true, email: true, status: true } },
        periods: { where: { id: body.periodId }, take: 1 },
      },
    });
    const reconciliationPeriod = reconciliation?.periods[0];
    if (!reconciliation || !reconciliationPeriod) {
      throw new AppError("渠道对账记录或分账期不存在", 404, "CHANNEL_RECONCILIATION_NOT_FOUND");
    }
    const summary = [
      `固费 ${amount(reconciliationPeriod.fixedFeeShareAmount, reconciliation.fixedFeeShareCurrency)}`,
      `销售佣金 ${amount(reconciliationPeriod.commissionShareAmount, reconciliation.commissionShareCurrency)}`,
    ].join("；");
    const common = {
      channel_name: reconciliation.channelUser.name,
      customer_name: reconciliation.customer.brandName,
      reconciliation_id: reconciliation.id,
      reconciliation_no: `${reconciliation.id}-${reconciliationPeriod.periodIndex}`,
      settlement_period: reconciliationPeriod.periodLabel || date(reconciliationPeriod.periodStart),
      amount_summary: summary,
    };

    if (body.kind === "REVIEW") {
      if (reconciliationPeriod.channelReviewStatus !== "PENDING") {
        throw new AppError("只有待渠道商确认的分账期可以发送待确认邮件", 409, "CHANNEL_REVIEW_NOT_PENDING");
      }
      if (reconciliation.channelUser.status !== "APPROVED" || !reconciliation.channelUser.email) {
        throw new AppError("渠道商账号没有有效邮箱，无法发送", 409, "CHANNEL_RECIPIENT_MISSING");
      }
      const result = await sendTemplateEmail({
        eventKey: "CHANNEL_RECONCILIATION_REVIEW",
        to: reconciliation.channelUser.email,
        variables: {
          ...common,
          recipient_name: reconciliation.channelUser.name,
          deadline: date(reconciliationPeriod.periodEnd),
          submitted_by: reconciliation.createdBy.name,
        },
        createdById: session.userId,
        businessType: "CHANNEL_RECONCILIATION_PERIOD",
        businessId: reconciliationPeriod.id,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (!["CONFIRMED", "DISPUTED", "SKIPPED"].includes(reconciliationPeriod.channelReviewStatus)) {
      throw new AppError("当前分账期尚无可发送的确认结果", 409, "CHANNEL_RESULT_UNAVAILABLE");
    }
    const result = await sendTemplateEmail({
      eventKey: "CHANNEL_RECONCILIATION_RESULT",
      to: reconciliation.createdBy.email,
      variables: {
        ...common,
        recipient_name: reconciliation.createdBy.name,
        result_status: reconciliationPeriod.channelReviewStatus === "CONFIRMED"
          ? "渠道商确认无异议"
          : reconciliationPeriod.channelReviewStatus === "DISPUTED"
            ? "渠道商提出异议"
            : "已跳过渠道确认",
        result_note: reconciliationPeriod.channelDisputeReason || reconciliationPeriod.notes || "无补充说明",
        confirmed_by: reconciliation.channelUser.name,
        confirmed_at: date(reconciliationPeriod.channelReviewedAt ?? reconciliationPeriod.updatedAt),
      },
      createdById: session.userId,
      businessType: "CHANNEL_RECONCILIATION_PERIOD",
      businessId: reconciliationPeriod.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "finance.channel-reconciliation.email");
  }
}
