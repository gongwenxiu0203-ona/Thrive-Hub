import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import { resolveContractFilePath } from "@/lib/contractFileStorage";
import { isStaff } from "@/lib/permissions";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isStaff(session.role)) {
    return NextResponse.json({ error: "无权下载合同模板" }, { status: 403 });
  }
  try {
    await requireFeaturePermission(session, "contracts", "MANAGE");
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权下载合同模板" }, { status: 403 });
    }
    throw error;
  }

  const { id } = await params;
  const template = await prisma.contractTemplate.findFirst({
    where: { id, deletedAt: null },
    select: { name: true, fileUrl: true },
  });
  if (!template) {
    return NextResponse.json({ error: "合同模板不存在" }, { status: 404 });
  }

  try {
    const filePath = await resolveContractFilePath(template.fileUrl, [
      "contract-templates",
    ]);
    if (!filePath) {
      return NextResponse.json({ error: "合同模板文件不存在" }, { status: 404 });
    }
    const bytes = await readFile(filePath);
    const filename = encodeURIComponent(`${template.name}.docx`);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "合同模板文件不存在" }, { status: 404 });
  }
}
