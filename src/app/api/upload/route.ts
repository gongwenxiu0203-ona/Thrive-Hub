import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";

const VALID_ENTITY_TYPES = new Set([
  "CUSTOMER",
  "CUSTOMER_DEMO",
  "TASK",
  "CONTRACT",
  "AFFILIATE",
]);

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
  if (!VALID_ENTITY_TYPES.has(entityType) || !entityId) {
    return NextResponse.json({ error: "缺少关联实体信息" }, { status: 400 });
  }

  try {
    const saved = await saveUploadedFile(file);
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
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "上传失败" },
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

  // Best-effort removal of the physical file.
  try {
    const fileName = path.basename(attachment.fileUrl);
    await unlink(path.join(process.cwd(), "uploads", fileName));
  } catch {
    // file already gone — ignore
  }

  await prisma.attachment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
