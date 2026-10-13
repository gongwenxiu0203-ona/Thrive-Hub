import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!isStaff(session.role)) return NextResponse.json({ error: "仅内部员工可以下载发票" }, { status: 403 });
  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id, deletedAt: null, documentType: "DOMESTIC" }, select: { billingRequest: { select: { applicantId: true } }, domesticDocument: { select: { originalFileUrl: true } } } });
  if (!invoice) return NextResponse.json({ error: "发票不存在。" }, { status: 404 });
  if (invoice.billingRequest?.applicantId !== session.userId) {
    try {
      await requireFeaturePermission(session, "finance.domestic_invoices", "READ");
    } catch (error) {
      if (error instanceof FeaturePermissionError) return NextResponse.json({ error: "无权下载发票" }, { status: 403 });
      throw error;
    }
  }
  const fileUrl = invoice?.domesticDocument?.originalFileUrl;
  if (!fileUrl) return NextResponse.json({ error: "发票原件不存在。" }, { status: 404 });
  const downloadUrl = new URL(fileUrl, request.url);
  downloadUrl.searchParams.set("download", "1");
  return NextResponse.redirect(downloadUrl);
}
