import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { channelReconciliationScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { saveUploadedFile } from "@/lib/upload";

const ALLOWED_PROOF_TYPES = new Set(['application/pdf','image/png','image/jpeg','image/webp']);
export async function POST(req: Request, { params }: { params: Promise<{ id: string; periodId: string }> }) {
  try {
    const session = await requireSession(); await requireFeaturePermission(session, 'finance.channel_reconciliation', 'EDIT');
    if (!['ADMIN','USER'].includes(session.role)) return NextResponse.json({ error: '仅内部员工可上传付款回单' }, { status: 403 });
    const { id, periodId } = await params;
    const period = await prisma.channelReconciliationPeriod.findFirst({ where: { id: periodId, reconciliationId: id, reconciliation: channelReconciliationScope(session, session.role === 'ADMIN' ? 'all' : 'mine') }, select: { fixedFeePaidAt: true, commissionPaidAt: true, channelReviewStatus: true } });
    if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (period.fixedFeePaidAt || period.commissionPaidAt) return NextResponse.json({ error: '该期已付款，不能替换回单' }, { status: 409 });
    if (!['CONFIRMED','SKIPPED'].includes(period.channelReviewStatus)) return NextResponse.json({ error: '渠道确认完成或跳过确认后才能上传付款回单' }, { status: 409 });
    const form = await req.formData(); const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: '请选择付款回单文件' }, { status: 400 });
    if (!ALLOWED_PROOF_TYPES.has(file.type)) return NextResponse.json({ error: '付款回单仅支持 JPG、PNG、WebP 或 PDF' }, { status: 400 });
    const saved = await saveUploadedFile(file); return NextResponse.json({ paymentProofUrl: saved.fileUrl });
  } catch (error) {
    if (error instanceof FeaturePermissionError) return NextResponse.json({ error: '无权限' }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : '上传失败' }, { status: 400 });
  }
}