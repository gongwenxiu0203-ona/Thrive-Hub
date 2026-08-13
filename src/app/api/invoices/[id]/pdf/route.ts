import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/permissions";
import {
  generateInvoicePdf,
  invoicePdfFilename,
  type InvoicePdfData,
} from "@/lib/invoicePdf";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import { getSession } from "@/lib/session";
import { errorResponse } from "@/lib/appError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBankSnapshot(value: string): InvoicePdfData["bankSnapshot"] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const source = parsed as Record<string, unknown>;
    const text = (key: string) =>
      typeof source[key] === "string" ? source[key] as string : null;
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!isStaff(session.role)) {
    return NextResponse.json(
      { error: "仅内部员工可以下载 Invoice" },
      { status: 403 },
    );
  }

  try {
    await requireFeaturePermission(session, "operations.invoices", "READ");
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json(
        { error: "无权访问 Invoice" },
        { status: 403 },
      );
    }
    return errorResponse(error, "invoices.pdf.authorization");
  }

  const { id } = await params;
  let invoice;
  try {
    // 读操作（PDF 下载）：上方已确保仅内部员工可访问，此处 staff 全量可见
    invoice = await prisma.invoice.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
  } catch (error) {
    return errorResponse(error, "invoices.pdf.lookup");
  }
  if (!invoice) {
    return NextResponse.json({ error: "Invoice 不存在" }, { status: 404 });
  }

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
    currencyTotals: Array.from(
      invoice.items.reduce((totals, item) => {
        const currency = item.currency.trim().toUpperCase();
        totals.set(currency, (totals.get(currency) ?? 0) + item.amount);
        return totals;
      }, new Map<string, number>()),
      ([currency, amount]) => ({ currency, amount }),
    ).sort((left, right) => left.currency.localeCompare(right.currency)),
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

  try {
    const pdf = await generateInvoicePdf(pdfInvoice);
    const filename = invoicePdfFilename(pdfInvoice);
    const fallback = `invoice-${invoice.invoiceNo}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error, `invoices.pdf:${invoice.id}`);
  }
}
