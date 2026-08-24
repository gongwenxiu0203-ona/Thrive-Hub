import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { channelReconciliationScope } from "@/lib/dataScope";
import { saveUploadedFile } from "@/lib/upload";
import { errorResponse } from "@/lib/appError";
import { ensureChannelPaymentRequest } from "@/lib/channelPaymentWorkflow";

const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
export async function POST(req: Request, { params }: { params: Promise<{ id: string; periodId: string }> }) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", session.role === "CHANNEL" ? "READ" : "EDIT");
    const { id, periodId } = await params;
    const period = await prisma.channelReconciliationPeriod.findFirst({ where: { id: periodId, reconciliationId: id, reconciliation: channelReconciliationScope(session, session.role === "CHANNEL" ? "mine" : "all") }, include: { businessDocuments: true } });
    if (!period) return NextResponse.json({ error: "渠道对账周期不存在或无权访问" }, { status: 404 });
    if (period.channelReviewStatus !== "CONFIRMED") return NextResponse.json({ error: "渠道确认无异议后才能上传 INVOICE 凭证" }, { status: 409 });
    if (["PAID"].includes(period.payableStatus)) return NextResponse.json({ error: "已付款周期不能补交业务凭证" }, { status: 409 });
    const form = await req.formData();
    const documentType = String(form.get("documentType") || "CHANNEL_INVOICE").trim().toUpperCase();
    if (!documentType.includes("INVOICE")) return NextResponse.json({ error: "渠道确认后必须提交 INVOICE 类型凭证" }, { status: 400 });
    const streamTypeValue = String(form.get("streamType") || period.streamType);
    const streamType = streamTypeValue === "FIXED_FEE" || streamTypeValue === "COMMISSION" ? streamTypeValue : null;
    if (!streamType) return NextResponse.json({ error: "必须选择固定费或销售佣金凭证" }, { status: 400 });
    if (period.streamType !== "BOTH" && period.streamType !== streamType) return NextResponse.json({ error: "凭证费用类型与渠道分账周期不一致" }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File) || !ALLOWED.has(file.type) || file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "请上传不超过 20MB 的 PDF、JPG、PNG 或 WebP" }, { status: 400 });
    const saved = await saveUploadedFile(file);
    const version = Math.max(0, ...period.businessDocuments.map((row) => row.version)) + 1;
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.channelBusinessDocument.create({ data: { channelPeriodId: periodId, streamType, uploadedById: session.userId, documentType, fileUrl: saved.fileUrl, documentNo: String(form.get("documentNo") || "").trim() || null, documentDate: form.get("documentDate") ? new Date(String(form.get("documentDate"))) : null, version } });
      await tx.channelReconciliationPeriod.update({ where: { id: periodId }, data: { businessDocumentStatus: "PENDING", financeReviewStatus: "PENDING", payableStatus: "WAITING_FINANCE_REVIEW" } });
      await tx.financeAuditLog.create({ data: { entityType: "CHANNEL_BUSINESS_DOCUMENT", entityId: created.id, action: "UPLOAD", actorId: session.userId, toStatus: "PENDING", metadata: JSON.stringify({ periodId, version }) } });
      return created;
    });
    let workflowWarning: string | null = null;
    try {
      await prisma.$transaction((tx) => ensureChannelPaymentRequest(tx, periodId, document.id, session.userId));
    } catch (workflowError) {
      workflowWarning = workflowError instanceof Error ? workflowError.message : "自动创建付款流程失败";
      await prisma.financeAuditLog.create({ data: { entityType: "CHANNEL_BUSINESS_DOCUMENT", entityId: document.id, action: "AUTO_PAYMENT_REQUEST_FAILED", actorId: session.userId, note: workflowWarning, metadata: JSON.stringify({ periodId }) } });
    }
    return NextResponse.json({ document, workflowWarning }, { status: 201 });
  } catch (error) {
    if (error instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(error, "finance.channel-business-documents.upload");
  }
}
