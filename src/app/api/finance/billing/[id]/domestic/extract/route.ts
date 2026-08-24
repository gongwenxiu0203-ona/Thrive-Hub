import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractDomesticInvoice } from "@/lib/domesticInvoiceExtract";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";

const ALLOWED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "operations.invoices", "EDIT");
    const { id } = await params;
    const billing = await prisma.billingRequest.findFirst({
      where: { id, documentType: "DOMESTIC", status: "PROCESSING" },
      select: { id: true },
    });
    if (!billing)
      return NextResponse.json(
        { error: "国内发票申请不存在或尚未受理。" },
        { status: 404 },
      );
    const form = await request.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !ALLOWED.has(file.type) ||
      file.size > 20 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: "请选择不超过 20MB 的 PDF、JPG、PNG 或 WebP 发票文件。" },
        { status: 400 },
      );
    }
    const result = await extractDomesticInvoice(file);
    const recognized = Object.values(result.fields).filter(
      (value) => value !== undefined && value !== "",
    ).length;
    return NextResponse.json({
      fields: result.fields,
      recognized,
      message: recognized
        ? `已识别 ${recognized} 个字段，请核对后提交。`
        : "未识别到结构化字段，请手工填写。",
    });
  } catch (error) {
    console.error("[domestic-invoice-extract]", error);
    if (error instanceof FeaturePermissionError)
      return NextResponse.json(
        { error: "无权限识别国内发票。" },
        { status: 403 },
      );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "发票识别失败，请手工填写。",
      },
      { status: 500 },
    );
  }
}
