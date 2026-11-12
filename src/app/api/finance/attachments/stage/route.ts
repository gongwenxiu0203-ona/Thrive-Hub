import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/appError";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/upload";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/permissions";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const actor=await prisma.user.findUnique({where:{id:session.userId},select:{role:true,status:true}});
  if(!actor||actor.status!=="APPROVED"||!isStaff(actor.role))return NextResponse.json({error:"仅已启用的内部账号可以上传财务附件"},{status:403});

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "请求格式错误，请重新选择文件" }, { status: 400 }); }

  const scope = String(form.get("scope") || "");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择需要上传的文件" }, { status: 400 });
  if (scope !== "PAYMENT" && scope !== "EXPENSE" && scope !== "BILLING") return NextResponse.json({ error: "附件用途无效" }, { status: 400 });
  if (!isStaff(session.role)) return NextResponse.json({ error: "仅内部员工可以上传财务申请附件" }, { status: 403 });

  try { await requireFeaturePermission(session, scope === "PAYMENT" ? "finance.payment_requests" : scope === "BILLING" ? "finance.billing_requests" : "finance.expenses", "EDIT"); }
  catch (error) {
    return errorResponse(error, `finance.attachment.stage.${scope.toLowerCase()}`);
  }
  try {
    const saved = await saveUploadedFile(file);
    await prisma.financeAttachment.create({ data: { entityType: `${scope}_STAGED`, entityId: session.userId, attachmentType: scope === 'BILLING' ? "CUSTOMER_AMOUNT_CONFIRMATION" : 'SUPPORTING_DOCUMENT', fileUrl: saved.fileUrl, fileName: saved.fileName, uploadedById: session.userId } });
    return NextResponse.json(saved);
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "文件上传失败" }, { status: 400 }); }
}
