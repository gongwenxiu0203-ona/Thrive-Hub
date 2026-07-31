import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { appendAuditEntry } from "@/lib/channelSplit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; periodId: string }> }) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, 'finance.channel_reconciliation', 'READ');
    if (session.role !== 'CHANNEL') return NextResponse.json({ error: '仅对应渠道商可确认或提出异议' }, { status: 403 });
    const { id, periodId } = await params; const body = await req.json();
    const action = ['CONFIRM','DISPUTE'].includes(body.action) ? body.action as 'CONFIRM'|'DISPUTE' : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const expectedVersion = Number(body.expectedVersion);
    if (!action) return NextResponse.json({ error: '操作类型无效' }, { status: 400 });
    if (action === 'DISPUTE' && !reason) return NextResponse.json({ error: '请填写异议原因' }, { status: 400 });
    if (reason.length > 2000) return NextResponse.json({ error: '异议原因不能超过 2000 字' }, { status: 400 });
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return NextResponse.json({ error: '确认版本无效，请刷新后重试' }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      const period = await tx.channelReconciliationPeriod.findFirst({ where: { id: periodId, reconciliationId: id, reconciliation: { channelUserId: session.userId, deletedAt: null } } });
      if (!period) throw new Error('NOT_FOUND');
      if (period.fixedFeePaidAt || period.commissionPaidAt) throw new Error('PAID_LOCKED');
      if (period.channelReviewStatus !== 'PENDING' || period.channelReviewVersion !== expectedVersion) throw new Error('STALE_STATE');
      const now = new Date(); const nextStatus = action === 'CONFIRM' ? 'CONFIRMED' : 'DISPUTED';
      const auditLog = appendAuditEntry(period.auditLog, { type: action === 'CONFIRM' ? 'CHANNEL_REVIEW_CONFIRMED' : 'CHANNEL_REVIEW_DISPUTED', actorId: session.userId, at: now.toISOString(), reason: action === 'CONFIRM' ? '渠道商确认无异议' : reason, before: { channelReviewStatus: period.channelReviewStatus, channelReviewVersion: period.channelReviewVersion }, after: { channelReviewStatus: nextStatus, channelReviewVersion: period.channelReviewVersion + 1, channelDisputeReason: action === 'DISPUTE' ? reason : null } });
      return tx.channelReconciliationPeriod.update({ where: { id: period.id }, data: { channelReviewStatus: nextStatus, channelReviewedAt: now, channelDisputeReason: action === 'DISPUTE' ? reason : null, channelReviewVersion: { increment: 1 }, auditLog } });
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FeaturePermissionError) return NextResponse.json({ error: '无权限' }, { status: 403 });
    const code = error instanceof Error ? error.message : '';
    if (code === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (code === 'PAID_LOCKED') return NextResponse.json({ error: '该期已付款，不能再次操作' }, { status: 409 });
    if (code === 'STALE_STATE') return NextResponse.json({ error: '记录状态已变化，请刷新后重试' }, { status: 409 });
    console.error('channel period review failed', error); return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}