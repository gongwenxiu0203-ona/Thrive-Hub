import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { contractScope } from "@/lib/dataScope";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import { resolveContractFilePath } from "@/lib/contractFileStorage";

/**
 * Download an annotated contract document after applying both the contracts
 * feature permission and the contract row-level scope. Annotation files live
 * under private/contract-annotations and cannot be served as public assets.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;

  try {
    await requireFeaturePermission(session, "contracts", "READ");
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权访问合同" }, { status: 403 });
    }
    throw error;
  }

  const annotation = await prisma.contractAnnotation.findFirst({
    where: {
      id,
      contract: {
        ...contractScope(session, session.role === "ADMIN" ? "all" : "mine"),
        deletedAt: null,
      },
    },
    select: { fileUrl: true },
  });
  if (!annotation?.fileUrl) {
    return NextResponse.json({ error: "批注文件不存在" }, { status: 404 });
  }

  const abs = await resolveContractFilePath(annotation.fileUrl, ["contract-annotations"]);
  if (!abs) return NextResponse.json({ error: "批注文件读取失败" }, { status: 404 });

  try {
    const bytes = await fs.readFile(abs);
    const fileName = encodeURIComponent(path.basename(abs));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "批注文件读取失败" }, { status: 404 });
  }
}
