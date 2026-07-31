import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { channelReconciliationScope } from "@/lib/dataScope";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import { appendAuditEntry } from "@/lib/channelSplit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; periodId: string }> }) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.channel_reconciliation", "EDIT");
    if (!['ADMIN','USER'].includes(session.role)) return NextResponse.json({ error: "仅内部员工可推送或跳过渠道商确认" }, { status: 403 });
    const { id, periodId } = await params;
    const body = await req.json();
    const action = ['PUSH','SKIP'].includes(body.action) ? body.action as 'PUSH'|'SKIP' : null;
    const expectedVersion = Number(body.expectedVersion);
    if (!action) return NextResponse.json({ error: "操作类型无效" }, { status: 400 });
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return NextResponse.json({ error: "确认版本无效，请刷新后重试" }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      const period = await tx.channelReconciliationPeriod.findFirst({ where: { id: periodId, reconciliationId: id, reconciliation: channelReconciliationScope(session, session.role === 'ADMIN' ? 'all' : 'mine') }, include: { reconciliation: { include: { customer: { select: { brandName: true } }, channelUser: { select: { id: true } }, contract: { select: { contractNo: true } } } } } });
      if (!period) throw new Error('NOT_FOUND');
      if (period.fixedFeePaidAt || period.commissionPaidAt) throw new Error('PAID_LOCKED');
      if (period.channelReviewStatus !== 'DRAFT' || period.channelReviewVersion !== expectedVersion) throw new Error('STALE_STATE');
      const hasFixed = period.fixedFeeReceived !== null && period.fixedFeeShareAmount !== null;
      const hasCommission = period.commissionReceived !== null && period.commissionShareAmount !== null;
      if ((period.streamType === 'FIXED_FEE' && !hasFixed) || (period.streamType === 'COMMISSION' && !hasCommission) || (period.streamType === 'BOTH' && !hasFixed && !hasCommission)) throw new Error('ENTRY_REQUIRED');
      const now = new Date(); const nextStatus = action === 'PUSH' ? 'PENDING' : 'SKIPPED';
      const auditLog = appendAuditEntry(period.auditLog, { type: action === 'PUSH' ? 'CHANNEL_REVIEW_PUSH' : 'CHANNEL_REVIEW_SKIPPED', actorId: session.userId, at: now.toISOString(), reason: action === 'PUSH' ? '推送渠道商确认' : '跳过渠道商确认', before: { channelReviewStatus: period.channelReviewStatus, channelReviewVersion: period.channelReviewVersion }, after: { channelReviewStatus: nextStatus, channelReviewVersion: period.channelReviewVersion + 1 } });
      const updated = await tx.channelReconciliationPeriod.update({ where: { id: period.id }, data: { channelReviewStatus: nextStatus, channelPushedAt: action === 'PUSH' ? now : null, channelReviewedAt: action === 'SKIP' ? now : null, channelDisputeReason: null, channelReviewVersion: { increment: 1 }, auditLog } });
      if (action === 'PUSH') {
        const label = period.streamType === 'FIXED_FEE' ? '固费分账' : period.streamType === 'COMMISSION' ? '抽佣分账' : '渠道商分账';
        await tx.reminder.create({ data: { title: `${label}待确认：${period.reconciliation.customer.brandName}`, content: `${period.periodLabel ?? ''} ${label}已推送，请进入渠道商分账详情确认或提出异议。`, remindDate: now, type: 'CHANNEL_SHARE_REVIEW', targetId: period.reconciliation.channelUser.id, createdById: session.userId } });
      }
      return updated;
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FeaturePermissionError) return NextResponse.json({ error: '无权限' }, { status: 403 });
    const code = error instanceof Error ? error.message : '';
    if (code === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (code === 'PAID_LOCKED') return NextResponse.json({ error: '该期已付款，不能再次操作' }, { status: 409 });
    if (code === 'STALE_STATE') return NextResponse.json({ error: '记录状态已变化，请刷新后重试' }, { status: 409 });
    if (code === 'ENTRY_REQUIRED') return NextResponse.json({ error: '请先完成本期分账录入' }, { status: 409 });
    console.error('channel period review-flow failed', error); return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}