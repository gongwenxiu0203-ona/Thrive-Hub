import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { errorResponse } from "@/lib/appError";
import { isStaff } from "@/lib/dataScope";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.affiliate_reconciliation", "EDIT");
    if (!isStaff(session.role)) {
      return NextResponse.json({ error: "仅内部员工可上传联盟商结算凭证" }, { status: 403 });
    }

    const { id } = await params;
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    }

    const saved = await saveUploadedFile(file);

    await prisma.affiliateReconciliation.update({
      where: { id },
      data: { proofUrl: saved.fileUrl },
    });

    return NextResponse.json({ proofUrl: saved.fileUrl });
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限上传联盟商结算凭证" }, { status: 403 });
    }
    return errorResponse(error, "finance.affiliate-reconciliation.proof.upload");
  }
}
