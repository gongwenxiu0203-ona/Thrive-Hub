import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/appError";
import { sendTemplateEmail } from "@/lib/emailService";
import { prisma } from "@/lib/prisma";
import {
  getReconciliationAccess,
  scopedReconciliationWhere,
} from "@/lib/reconciliationAccess";
import { requireSession } from "@/lib/session";

type MailKind = "REVIEW" | "RESULT" | "INVOICE_OVERDUE";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function shanghaiCalendarDay(date: Date): number {
  return Math.floor((date.getTime() + SHANGHAI_OFFSET_MS) / DAY_MS);
}

function date(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(value);
}

function period(start: Date, end: Date): string {
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return `${iso(start)} 至 ${iso(end)}`;
}

function amountSummary(record: {
  reconcileType: string;
  feeAmount: number;
  fixedFeeCurrency: string;
  commissionAmount: number;
  finalCommissionAmount: number | null;
  commissionCurrency: string;
}): string {
  const rows: string[] = [];
  if (record.reconcileType !== "COMMISSION_ONLY") {
    rows.push(`固费 ${record.fixedFeeCurrency} ${record.feeAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`);
  }
  if (record.reconcileType !== "FEE_ONLY") {
    const amount = record.finalCommissionAmount ?? record.commissionAmount;
    rows.push(`销售佣金 ${record.commissionCurrency} ${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`);
  }
  return rows.join("；") || "金额待核对";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "EDIT", request);
    const { id } = await params;
    const body = await request.json().catch(() => null) as { kind?: MailKind } | null;
    const kind = body?.kind;
    if (!kind || !["REVIEW", "RESULT", "INVOICE_OVERDUE"].includes(kind)) {
      throw new AppError("请选择有效的客户对账邮件类型", 400, "RECONCILIATION_EMAIL_KIND_INVALID");
    }

    const reconciliation = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: {
        customer: {
          select: {
            brandName: true,
            businessOwner: { select: { id: true, name: true, email: true, status: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true, status: true } },
        submittedBy: { select: { id: true, name: true, email: true, status: true } },
        submittedToUser: { select: { id: true, name: true, email: true, status: true } },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { reviewer: { select: { name: true } } },
        },
        invoiceLinks: {
          where: { invoice: { deletedAt: null, status: "ISSUED" } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!reconciliation) {
      throw new AppError("客户对账记录不存在、已删除或无权访问", 404, "RECONCILIATION_NOT_FOUND");
    }

    const summary = amountSummary(reconciliation);
    const periodLabel = period(reconciliation.periodStart, reconciliation.periodEnd);
    if (kind === "REVIEW") {
      if (reconciliation.status !== "PENDING_REVIEW") {
        throw new AppError("只有待确认状态的客户对账可以发送待确认邮件", 409, "RECONCILIATION_NOT_PENDING");
      }
      const recipient = reconciliation.submittedToUser ?? reconciliation.customer.businessOwner;
      if (!recipient || recipient.status !== "APPROVED" || !recipient.email) {
        throw new AppError("该对账未配置有效的确认人邮箱", 409, "RECONCILIATION_RECIPIENT_MISSING");
      }
      const result = await sendTemplateEmail({
        eventKey: "CUSTOMER_RECONCILIATION_REVIEW",
        to: recipient.email,
        variables: {
          recipient_name: recipient.name,
          customer_name: reconciliation.customer.brandName,
          customer_id: reconciliation.customerId,
          reconciliation_no: reconciliation.id,
          reconciliation_period: periodLabel,
          amount_summary: summary,
          deadline: date(reconciliation.submittedDeadline),
          submitted_by: reconciliation.submittedBy?.name ?? reconciliation.createdBy.name,
        },
        createdById: session.userId,
        businessType: "CUSTOMER_RECONCILIATION",
        businessId: reconciliation.id,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (kind === "INVOICE_OVERDUE") {
      if (reconciliation.status !== "CONFIRMED") {
        throw new AppError("只有已确认的客户对账可以发送 Invoice 逾期提醒", 409, "RECONCILIATION_NOT_CONFIRMED");
      }
      if (reconciliation.invoiceLinks.length > 0) {
        throw new AppError("该对账已经开具正式 Invoice，无需发送逾期提醒", 409, "INVOICE_ALREADY_ISSUED");
      }
      const confirmedAt = reconciliation.reviews[0]?.createdAt ?? reconciliation.updatedAt;
      const elapsedDays = shanghaiCalendarDay(new Date()) - shanghaiCalendarDay(confirmedAt);
      if (elapsedDays < 3) {
        throw new AppError("对账确认尚未满 3 个自然日，暂不能发送逾期提醒", 409, "INVOICE_NOT_OVERDUE");
      }
      const recipient = reconciliation.createdBy;
      const result = await sendTemplateEmail({
        eventKey: "INVOICE_OVERDUE",
        to: recipient.email,
        variables: {
          recipient_name: recipient.name,
          customer_name: reconciliation.customer.brandName,
          reconciliation_no: reconciliation.id,
          reconciliation_ids: reconciliation.id,
          reconciliation_period: periodLabel,
          amount_summary: summary,
          confirmed_at: date(confirmedAt),
        },
        createdById: session.userId,
        businessType: "CUSTOMER_RECONCILIATION",
        businessId: reconciliation.id,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (!(["CONFIRMED", "DISPUTED"] as string[]).includes(reconciliation.status)) {
      throw new AppError("当前客户对账状态不能发送确认结果邮件", 409, "RECONCILIATION_RESULT_UNAVAILABLE");
    }
    const recipient = reconciliation.submittedBy ?? reconciliation.createdBy;
    const latestReview = reconciliation.reviews[0];
    const result = await sendTemplateEmail({
      eventKey: "CUSTOMER_RECONCILIATION_RESULT",
      to: recipient.email,
      variables: {
        recipient_name: recipient.name,
        customer_name: reconciliation.customer.brandName,
        customer_id: reconciliation.customerId,
        reconciliation_no: reconciliation.id,
        reconciliation_period: periodLabel,
        amount_summary: summary,
        result_status: reconciliation.status === "CONFIRMED" ? "确认无异议" : "销售额有异议",
        result_note: latestReview?.note || "无补充说明",
        confirmed_by: latestReview?.reviewer.name || "系统用户",
        confirmed_at: date(latestReview?.createdAt ?? reconciliation.updatedAt),
      },
      createdById: session.userId,
      businessType: "CUSTOMER_RECONCILIATION",
      businessId: reconciliation.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "finance.reconciliation.email");
  }
}
