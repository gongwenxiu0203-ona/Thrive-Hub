import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";
import {
  AttachmentEntityNotFoundError,
  isAttachmentEntityType,
  requireAttachmentEntityAccess,
} from "@/lib/attachmentAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";

function accessErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof FeaturePermissionError) {
    return NextResponse.json({ error: "无权执行此附件操作" }, { status: 403 });
  }
  if (error instanceof AttachmentEntityNotFoundError) {
    return NextResponse.json({ error: "关联实体不存在" }, { status: 404 });
  }
  return null;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (!isAttachmentEntityType(entityType) || !entityId) {
    return NextResponse.json({ error: "缺少关联实体信息" }, { status: 400 });
  }

  try {
    await requireAttachmentEntityAccess(session, entityType, entityId, "EDIT");
    const saved = await saveUploadedFile(file);
    try {
      const attachment = await prisma.attachment.create({
        data: {
          fileName: saved.fileName,
          fileUrl: saved.fileUrl,
          fileSize: saved.fileSize,
          entityType,
          entityId,
          uploadedById: session.userId,
        },
      });
      return NextResponse.json({ attachment });
    } catch (error) {
      const fileName = path.basename(saved.fileUrl);
      await unlink(path.join(process.cwd(), "uploads", fileName)).catch(() => {});
      throw error;
    }
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) {
    return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  }
  if (!isAttachmentEntityType(attachment.entityType)) {
    return NextResponse.json({ error: "不支持的附件实体类型" }, { status: 400 });
  }

  try {
    const required = attachment.uploadedById === session.userId ? "EDIT" : "MANAGE";
    await requireAttachmentEntityAccess(
      session,
      attachment.entityType,
      attachment.entityId,
      required,
    );
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    throw error;
  }

  await prisma.attachment.delete({ where: { id } });

  try {
    const fileName = path.basename(attachment.fileUrl);
    await unlink(path.join(process.cwd(), "uploads", fileName));
  } catch {
    // The database authorization record is gone; orphan cleanup is best effort.
  }

  return NextResponse.json({ ok: true });
}
