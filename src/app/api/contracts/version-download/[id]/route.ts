import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { contractFileBaseName } from "@/lib/contractFileName";
import { contractScope } from "@/lib/dataScope";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import { resolveContractFilePath } from "@/lib/contractFileStorage";

const CONTENT_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

export async function GET(
  req: NextRequest,
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

  const version = await prisma.contractVersion.findFirst({
    where: {
      id,
      contract: {
        ...contractScope(session, session.role === "ADMIN" ? "all" : "mine"),
        deletedAt: null,
      },
    },
    include: {
      contract: {
        include: { customer: { select: { brandName: true } } },
      },
    },
  });
  if (!version) {
    return NextResponse.json({ error: "合同版本不存在" }, { status: 404 });
  }

  const abs = await resolveContractFilePath(version.fileUrl, ["contracts-generated", "contracts-stamped"]);
  if (!abs) return NextResponse.json({ error: "合同文件不存在或无法读取" }, { status: 404 });

  try {
    const bytes = await fs.readFile(abs);
    const ext = version.fileType.toLowerCase();
    const inline = req.nextUrl.searchParams.get("inline") === "1";
    const filename = encodeURIComponent(`${contractFileBaseName(version.contract)}-v${version.versionNo}.${ext}`);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "合同文件不存在或无法读取" }, { status: 404 });
  }
}
