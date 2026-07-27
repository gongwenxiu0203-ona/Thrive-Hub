import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";
import { extractFileText } from "@/lib/contractFile";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";

type MediaKitItem = {
  id: string;
  attachmentId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  text: string;
  error?: string;
  createdAt: string;
};

function parseItems(value: string | null | undefined): MediaKitItem[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function canExtract(fileName: string, fileType: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  if (fileType.startsWith("image/")) return false;
  return [".pdf", ".doc", ".docx", ".txt", ".md"].includes(ext);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const permission = await resolveUserPermission(session.userId, "affiliates.media");
  if (!hasPermissionLevel(permission, "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { id },
    select: { id: true, mediaKitItems: true },
  });
  if (!affiliate) return NextResponse.json({ error: "联盟商不存在" }, { status: 404 });

  let text = "";
  let error: string | undefined;
  if (canExtract(file.name, file.type)) {
    try {
      text = (await extractFileText(file)).trim();
    } catch (e) {
      error = e instanceof Error ? e.message : "文档识别失败";
    }
  }

  const saved = await saveUploadedFile(file);
  const attachment = await prisma.attachment.create({
    data: {
      fileName: saved.fileName,
      fileUrl: saved.fileUrl,
      fileSize: saved.fileSize,
      entityType: "AFFILIATE",
      entityId: id,
      uploadedById: session.userId,
    },
  });

  const item: MediaKitItem = {
    id: randomUUID(),
    attachmentId: attachment.id,
    fileName: attachment.fileName,
    fileUrl: attachment.fileUrl,
    fileSize: attachment.fileSize,
    fileType: file.type || path.extname(file.name).toLowerCase() || "file",
    text,
    error,
    createdAt: attachment.createdAt.toISOString(),
  };
  const items = [item, ...parseItems(affiliate.mediaKitItems)];

  await prisma.affiliate.update({
    where: { id },
    data: { mediaKitItems: JSON.stringify(items) },
  });

  return NextResponse.json({ item });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const permission = await resolveUserPermission(session.userId, "affiliates.media");
  if (!hasPermissionLevel(permission, "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { itemId, text } = await req.json();
  const affiliate = await prisma.affiliate.findUnique({
    where: { id },
    select: { mediaKitItems: true },
  });
  if (!affiliate) return NextResponse.json({ error: "联盟商不存在" }, { status: 404 });

  const items = parseItems(affiliate.mediaKitItems);
  const next = items.map((item) => item.id === itemId ? { ...item, text: String(text ?? "") } : item);
  await prisma.affiliate.update({
    where: { id },
    data: { mediaKitItems: JSON.stringify(next) },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const permission = await resolveUserPermission(session.userId, "affiliates.media");
  if (!hasPermissionLevel(permission, "MANAGE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const itemId = req.nextUrl.searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });

  const affiliate = await prisma.affiliate.findUnique({
    where: { id },
    select: { mediaKitItems: true },
  });
  if (!affiliate) return NextResponse.json({ error: "联盟商不存在" }, { status: 404 });

  const items = parseItems(affiliate.mediaKitItems);
  const target = items.find((item) => item.id === itemId);
  const next = items.filter((item) => item.id !== itemId);

  if (target?.attachmentId) {
    const attachment = await prisma.attachment.findFirst({
      where: { id: target.attachmentId, entityType: "AFFILIATE", entityId: id },
    });
    if (attachment) {
      await prisma.$transaction([
        prisma.affiliate.update({
          where: { id },
          data: { mediaKitItems: JSON.stringify(next) },
        }),
        prisma.attachment.delete({ where: { id: attachment.id } }),
      ]);
      try {
        const fileName = path.basename(attachment.fileUrl);
        await unlink(path.join(process.cwd(), "uploads", fileName));
      } catch {
        // best effort
      }
      return NextResponse.json({ ok: true });
    }
  }

  await prisma.affiliate.update({
    where: { id },
    data: { mediaKitItems: JSON.stringify(next) },
  });
  return NextResponse.json({ ok: true });
}
