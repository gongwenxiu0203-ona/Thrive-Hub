import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";
import { ensureChannelPaymentRequest } from "@/lib/channelPaymentWorkflow";

export async function POST(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "EDIT");
    if (!['ADMIN', 'USER'].includes(session.role)) return NextResponse.json({ error: "仅内部财务人员可审核渠道凭证" }, { status: 403 });
    const { documentId } = await params;
    const body = await req.json();
    const decision = body.decision === "APPROVED" ? "APPROVED" : body.decision === "REJECTED" ? "REJECTED" : null;
    if (!decision) return NextResponse.json({ error: "审核结果必须为 APPROVED 或 REJECTED" }, { status: 400 });
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (decision === "REJECTED" && !reason) return NextResponse.json({ error: "驳回凭证时必须填写原因" }, { status: 400 });
    const existing = await prisma.channelBusinessDocument.findUnique({ where: { id: documentId } });
    if (!existing || existing.status !== "PENDING") return NextResponse.json({ error: "凭证不存在或已完成审核" }, { status: 409 });
    const document = await prisma.$transaction(async (tx) => {
      const updated = await tx.channelBusinessDocument.update({ where: { id: documentId }, data: { status: decision, reviewedById: session.userId, reviewedAt: new Date(), rejectionReason: decision === "REJECTED" ? reason : null } });
      await tx.channelReconciliationPeriod.update({ where: { id: existing.channelPeriodId }, data: { businessDocumentStatus: decision, financeReviewStatus: decision, payableStatus: decision === "APPROVED" ? "WAITING_PAYMENT" : "DOCUMENT_REJECTED" } });
      await tx.financeAuditLog.create({ data: { entityType: "CHANNEL_BUSINESS_DOCUMENT", entityId: documentId, action: decision === "APPROVED" ? "APPROVE" : "REJECT", actorId: session.userId, fromStatus: "PENDING", toStatus: decision, note: reason || null } });
      if (decision === "APPROVED") await ensureChannelPaymentRequest(tx, existing.channelPeriodId, documentId, session.userId);
      return updated;
    });
    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(error, "finance.channel-business-documents.review");
  }
}
