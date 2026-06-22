import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { contractFileBaseName } from "@/lib/contractFileName";

const CONTENT_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id } = await params;

  const version = await prisma.contractVersion.findUnique({
    where: { id },
    include: {
      contract: {
        include: { customer: { select: { brandName: true } } },
      },
    },
  });
  if (!version) {
    return NextResponse.json({ error: "合同版本不存在" }, { status: 404 });
  }

  const relative = version.fileUrl.replace(/^\//, "");
  const abs = path.resolve(process.cwd(), "public", relative);
  const publicRoot = path.resolve(process.cwd(), "public");
  if (!abs.startsWith(publicRoot)) {
    return NextResponse.json({ error: "文件路径无效" }, { status: 400 });
  }

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
      },
    });
  } catch {
    return NextResponse.json({ error: "合同文件不存在或无法读取" }, { status: 404 });
  }
}
