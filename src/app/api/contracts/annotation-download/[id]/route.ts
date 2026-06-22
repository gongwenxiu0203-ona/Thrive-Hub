import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

/**
 * 鉴权下载批注后的 DOCX：会校验当前用户能否访问该合同（admin / 审核人 /
 * 提交人 / 负责人）。文件存放在 process.cwd()/private/contract-annotations
 * （不在 public/ 下，无法被静态直链访问）。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;

  const annotation = await prisma.contractAnnotation.findUnique({
    where: { id },
    include: {
      contract: {
        select: {
          id: true,
          createdById: true,
          ownerId: true,
          reviewerId: true,
        },
      },
    },
  });
  if (!annotation || !annotation.fileUrl) {
    return NextResponse.json({ error: "批注文件不存在" }, { status: 404 });
  }

  // 权限：admin / 该合同的 reviewer / owner / 创建人 可下载
  const c = annotation.contract;
  const allowed =
    session.role === "ADMIN" ||
    session.userId === c.reviewerId ||
    session.userId === c.ownerId ||
    session.userId === c.createdById;
  if (!allowed) {
    return NextResponse.json({ error: "无权下载该批注" }, { status: 403 });
  }

  // fileUrl 形如 "/contract-annotations/{id}-annotated-{ts}.docx"
  const rel = annotation.fileUrl.replace(/^\//, "");
  const privateRoot = path.resolve(process.cwd(), "private");
  const abs = path.resolve(privateRoot, rel);
  if (!abs.startsWith(privateRoot)) {
    return NextResponse.json({ error: "文件路径无效" }, { status: 400 });
  }

  try {
    const bytes = await fs.readFile(abs);
    const fileName = encodeURIComponent(path.basename(abs));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
        "Content-Length": String(bytes.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "批注文件读取失败" }, { status: 404 });
  }
}
