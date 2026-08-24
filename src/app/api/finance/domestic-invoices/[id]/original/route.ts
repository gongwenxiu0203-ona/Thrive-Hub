import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  await requireFeaturePermission(session, "operations.invoices", "READ");
  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id, deletedAt: null, documentType: "DOMESTIC" }, select: { domesticDocument: { select: { originalFileUrl: true } } } });
  const fileUrl = invoice?.domesticDocument?.originalFileUrl;
  if (!fileUrl) return NextResponse.json({ error: "发票原件不存在。" }, { status: 404 });
  return NextResponse.redirect(new URL(fileUrl, request.url));
}
