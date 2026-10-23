import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  AttachmentEntityNotFoundError,
  isAttachmentEntityType,
  requireAttachmentEntityAccess,
} from "@/lib/attachmentAccess";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { name } = await params;
  const safeName = path.basename(name);
  if (safeName !== name) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const attachment = await prisma.attachment.findFirst({
    where: { fileUrl: `/uploads/${safeName}` },
    select: { entityType: true, entityId: true },
  });
  const financeAttachment = !attachment ? await prisma.financeAttachment.findFirst({
    where: { fileUrl: `/uploads/${safeName}`, entityType: { in: ["PAYMENT_REQUEST", "EXPENSE_CLAIM"] } },
    select: { entityType: true, entityId: true },
  }) : null;
  if ((!attachment || !isAttachmentEntityType(attachment.entityType)) && !financeAttachment) return NextResponse.json({ error: "文件不存在" }, { status: 404 });

  try {
    if (financeAttachment) {
      const isPayment = financeAttachment.entityType === "PAYMENT_REQUEST";
      const record = isPayment
        ? await prisma.paymentRequest.findUnique({ where: { id: financeAttachment.entityId }, select: { applicantId: true } })
        : await prisma.expenseClaim.findUnique({ where: { id: financeAttachment.entityId }, select: { employeeId: true } });
      const ownerId = record && ("applicantId" in record ? record.applicantId : record.employeeId);
      if (!ownerId) return NextResponse.json({ error: "文件不存在" }, { status: 404 });
      if (session.userId !== ownerId) await requireFeaturePermission(session, isPayment ? "finance.payment_requests" : "finance.expenses", "READ");
    } else if (attachment && isAttachmentEntityType(attachment.entityType)) {
      await requireAttachmentEntityAccess(session, attachment.entityType, attachment.entityId, "READ");
    }
  } catch (error) {
    if (
      error instanceof FeaturePermissionError ||
      error instanceof AttachmentEntityNotFoundError
    ) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    throw error;
  }

  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const filePath = path.resolve(uploadsRoot, safeName);
  if (!filePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(safeName).toLowerCase();
    const forceDownload = new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        ...(forceDownload
          ? { "Content-Disposition": `attachment; filename="${safeName.replace(/[\r\n"]/g, "_")}"` }
          : {}),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}
