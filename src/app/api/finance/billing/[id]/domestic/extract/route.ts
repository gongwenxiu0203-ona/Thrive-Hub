import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractDomesticInvoice } from "@/lib/domesticInvoiceExtract";
import {
  FeaturePermissionError,
} from "@/lib/permissionGuard";
import { domesticInvoiceUploader } from "@/lib/domesticInvoiceUploadAccess";
import { domesticInvoiceForm, domesticInvoiceFile, DomesticUploadError } from "@/lib/domesticInvoiceUpload";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await domesticInvoiceUploader();
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
    const form = await domesticInvoiceForm(request);
    const file = await domesticInvoiceFile(form.get("file"));
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
    if (error instanceof DomesticUploadError) return NextResponse.json({error:error.message},{status:error.status});
    if (error instanceof FeaturePermissionError)
      return NextResponse.json(
        { error: "无权限识别国内发票。" },
        { status: 403 },
      );
    return NextResponse.json(
      {
        error:
          "发票识别暂时不可用，请手工填写后继续归档。",
      },
      { status: 500 },
    );
  }
}
