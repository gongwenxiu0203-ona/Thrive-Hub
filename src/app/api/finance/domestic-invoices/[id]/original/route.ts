import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { getSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { domesticInvoiceOriginal } from "@/lib/domesticInvoiceUploadAccess";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if(!session)return NextResponse.json({error:"请重新登录。"},{status:401});
  const user=await prisma.user.findUnique({where:{id:session.userId},select:{role:true,status:true}});
  if (!user || user.status!=="APPROVED" || !isStaff(user.role)) return NextResponse.json({ error: "仅已启用的内部账号可以下载发票" }, { status: 403 });
  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id, deletedAt: null, documentType: "DOMESTIC" }, select: { billingRequest: { select: { applicantId: true } }, domesticDocument: { select: { originalFileUrl: true } } } });
  if (!invoice) return NextResponse.json({ error: "发票不存在。" }, { status: 404 });
  if (invoice.billingRequest?.applicantId !== session.userId) {
    try {
      await requireFeaturePermission(session, "finance.domestic_invoices", "READ");
    } catch (error) {
      if (error instanceof FeaturePermissionError) return NextResponse.json({ error: "无权下载发票" }, { status: 403 });
      throw error;
    }
  }
  const fileUrl = invoice?.domesticDocument?.originalFileUrl;
  if (!fileUrl) return NextResponse.json({ error: "发票原件不存在。" }, { status: 404 });
  try {
    // Direct authorization via invoice/document also supports legacy rows without attachment metadata.
    const file=await domesticInvoiceOriginal(fileUrl);
    return new NextResponse(new Uint8Array(file.data),{headers:{"Content-Type":file.type,"Content-Disposition":`attachment; filename="invoice${file.type==='application/pdf'?'.pdf':'.'+file.name.split('.').at(-1)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch {return NextResponse.json({error:"发票原件不存在或当前不可读取。"},{status:404});}
}
