import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerScope } from "@/lib/dataScope";
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
    throw error;
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(session.role === "ADMIN"
        ? {}
        : {
            OR: [
              { createdById: session.userId },
              { customer: customerScope(session, "mine") },
            ],
          }),
    },
    include: {
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
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
    bankSnapshot: parseBankSnapshot(invoice.bankSnapshot),
    terms: invoice.terms,
    items: invoice.items.map((item) => ({
      feeType: item.feeType,
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
    console.error("[invoice-pdf] generation failed", {
      invoiceId: invoice.id,
      error,
    });
    return NextResponse.json(
      { error: "Invoice PDF 生成失败，请稍后重试" },
      { status: 500 },
    );
  }
}
