import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/appError";
import { sendTemplateEmail } from "@/lib/emailService";
import {
  generateInvoicePdf,
  invoicePdfFilename,
  type InvoicePdfData,
} from "@/lib/invoicePdf";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { isStaff } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

function parseBankSnapshot(value: string): InvoicePdfData["bankSnapshot"] {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const text = (key: string) => typeof parsed[key] === "string" ? parsed[key] as string : null;
    return {
      beneficiary: text("beneficiary"),
      bankName: text("bankName"),
      bankAddress: text("bankAddress"),
      swiftCode: text("swiftCode"),
      accountNo: text("accountNo"),
    };
  } catch {
    return {};
  }
}

function date(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "Asia/Shanghai" }).format(value);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.invoices", "EDIT");
    if (!isStaff(session.role)) {
      throw new AppError("仅内部员工可以发送 Invoice", 403, "PERMISSION_DENIED");
    }
    const { id } = await params;
    const invoice = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { select: { brandName: true, contactName: true, contactEmail: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!invoice) throw new AppError("Invoice 不存在", 404, "INVOICE_NOT_FOUND");
    if (invoice.status !== "ISSUED") {
      throw new AppError("只有已正式开具的 Invoice 才能发送给客户", 409, "INVOICE_NOT_ISSUED");
    }
    const recipient = invoice.customer?.contactEmail?.trim();
    if (!recipient) {
      throw new AppError("关联客户尚未填写联系人邮箱，请先在客户资料中补充", 409, "CUSTOMER_EMAIL_MISSING");
    }

    const currencyTotals = Array.from(
      invoice.items.reduce((totals, item) => {
        const currency = item.currency.trim().toUpperCase();
        totals.set(currency, (totals.get(currency) ?? 0) + item.amount);
        return totals;
      }, new Map<string, number>()),
      ([currency, amount]) => ({ currency, amount }),
    ).sort((left, right) => left.currency.localeCompare(right.currency));
    const pdfInvoice: InvoicePdfData = {
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      periodLabel: invoice.periodLabel,
      feeType: invoice.feeType,
      clientName: invoice.clientName,
      clientAddress: invoice.clientAddress,
      currency: invoice.currency,
      totalAmount: invoice.totalAmount,
      currencyTotals,
      bankSnapshot: parseBankSnapshot(invoice.bankSnapshot),
      terms: invoice.terms,
      items: invoice.items.map((item) => ({
        feeType: item.feeType,
        currency: item.currency,
        periodType: item.periodType,
        periodLabel: item.periodLabel,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
      })),
    };
    const pdf = Buffer.from(await generateInvoicePdf(pdfInvoice));
    const result = await sendTemplateEmail({
      eventKey: "INVOICE_DELIVERY",
      to: recipient,
      variables: {
        recipient_name: invoice.customer?.contactName || invoice.clientName,
        customer_name: invoice.customer?.brandName || invoice.clientName,
        invoice_no: invoice.invoiceNo,
        invoice_date: date(invoice.invoiceDate),
        payment_due: date(invoice.dueDate),
        amount_summary: currencyTotals
          .map((item) => `${item.currency} ${item.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`)
          .join("；"),
        issuer_name: invoice.createdBy?.name || "Thraive 财务团队",
        issuer_email: invoice.createdBy?.email || "—",
      },
      createdById: session.userId,
      businessType: "INVOICE",
      businessId: invoice.id,
      attachment: {
        fileName: invoicePdfFilename(pdfInvoice),
        content: pdf,
      },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "invoices.email");
  }
}
