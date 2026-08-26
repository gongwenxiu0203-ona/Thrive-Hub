import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { createCustomerReceipt, parseMoney, type ReceiptAllocationInput } from "@/lib/financeWorkflow";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/appError";

export async function GET() {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.receipt_allocation", "READ");
    if (!['ADMIN', 'USER'].includes(session.role)) return NextResponse.json({ error: "仅内部员工可查看收款流水" }, { status: 403 });
    const receipts = await prisma.customerReceipt.findMany({ include: { customer: { select: { id: true, brandName: true } }, allocations: true, createdBy: { select: { id: true, name: true } } }, orderBy: { receivedAt: "desc" }, take: 200 });
    return NextResponse.json({ receipts });
  } catch (error) {
    if (error instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(error, "finance.customer-receipts.list");
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.receipt_allocation", "EDIT");
    if (!['ADMIN', 'USER'].includes(session.role)) return NextResponse.json({ error: "仅内部员工可登记客户到账" }, { status: 403 });
    const body = await req.json();
    const allocations: ReceiptAllocationInput[] = Array.isArray(body.allocations) ? body.allocations.map((row: Record<string, unknown>) => ({
      accountsReceivableId: typeof row.accountsReceivableId === "string" ? row.accountsReceivableId : undefined,
      invoiceId: typeof row.invoiceId === "string" ? row.invoiceId : undefined,
      reconciliationId: typeof row.reconciliationId === "string" ? row.reconciliationId : undefined,
      feeType: row.feeType === "COMMISSION" ? "COMMISSION" : "FIXED_FEE",
      amount: parseMoney(row.amount, "核销金额"),
    })) : [];
    const receivedAt = new Date(body.receivedAt);
    if (!body.customerId || !body.currency || Number.isNaN(receivedAt.getTime())) return NextResponse.json({ error: "客户、币种和到账时间为必填项" }, { status: 400 });
    const receipt = await createCustomerReceipt({
      customerId: body.customerId, currency: String(body.currency).trim().toUpperCase(),
      amount: parseMoney(body.amount, "到账金额"), receivedAt,
      bankReference: typeof body.bankReference === "string" ? body.bankReference.trim() : undefined,
      proofUrls: Array.isArray(body.proofUrls) ? body.proofUrls.filter((url: unknown): url is string => typeof url === "string") : [],
      remark: typeof body.remark === "string" ? body.remark.trim() : undefined,
      createdById: session.userId, allocations,
    });
    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    if (error instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    if (error instanceof Error && /必须|不能|不存在|不属于|超过|不一致/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return errorResponse(error, "finance.customer-receipts.create");
  }
}
