import { NextResponse } from "next/server";
import { adminHasFeature, getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { pickAppliedFields } from "@/lib/intakeSubmission";

const LEO_EMAIL = "leo.g@thraiveagency.com";
const LEDO_EMAIL = "ledo.h@thraiveagency.com";

async function notifyNewCustomer(customerId: string, brandName: string) {
  const leo = await prisma.user.findFirst({ where: { email: LEO_EMAIL }, select: { id: true } });
  if (!leo) return;
  const exists = await prisma.task.findFirst({ where: { customerId, ownerId: leo.id, category: "FOLLOWUP" }, select: { id: true } });
  if (!exists) await prisma.task.create({ data: { title: `客户分配 · ${brandName}`, description: "新客户信息已通过管理员审核，请跟进客户分配。", customerId, ownerId: leo.id, publisherId: leo.id, priority: "MID", category: "FOLLOWUP", status: "TODO", sortOrder: await prisma.task.count({ where: { status: "TODO" } }) } });
  await prisma.reminder.create({ data: { title: `新客户分配：${brandName}`, content: `客户「${brandName}」的信息收集申请已审核通过，请处理客户分配。`, remindDate: new Date(), type: "FOLLOWUP", targetId: leo.id, createdById: leo.id } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!await adminHasFeature(session, "intake.review", "EDIT")) return NextResponse.json({ error: "当前账号没有批准客户资料的权限" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { appliedFields?: unknown; mergeCustomerId?: string; reviewNote?: string };
  const submission = await prisma.customerIntakeSubmission.findUnique({ where: { id } });
  if (!submission) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  if (submission.status !== "PENDING") return NextResponse.json({ error: "该记录已处理" }, { status: 409 });
  const payload = JSON.parse(submission.payload) as Record<string, unknown>;
  const updates = pickAppliedFields(payload, body.appliedFields);
  const applied = Object.keys(updates);
  const ledo = await prisma.user.findFirst({ where: { email: LEDO_EMAIL }, select: { id: true } });

  try {
    const result = await prisma.$transaction(async (tx) => {
      let customerId: string;
      let created = false;
      if (submission.type === "GENERAL_NEW" && !body.mergeCustomerId) {
        const customer = await tx.customer.create({ data: { ...updates, brandName: String(updates.brandName || submission.brandName), source: "INTAKE", status: "UNASSIGNED", createdById: submission.sharedByUserId ?? submission.channelUserId ?? session.userId, channelUserId: submission.channelUserId, businessOwnerId: submission.sharedByUserId ?? ledo?.id ?? null } });
        customerId = customer.id; created = true;
      } else {
        customerId = body.mergeCustomerId || submission.customerId || "";
        if (!customerId) throw new Error("未指定要更新的客户");
        const target = await tx.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } });
        if (!target) throw new Error("目标客户不存在");
        await tx.customer.update({ where: { id: customerId }, data: updates });
      }
      await tx.customerIntakeSubmission.update({ where: { id }, data: { status: "APPROVED", reviewedById: session.userId, reviewedAt: new Date(), reviewNote: body.reviewNote?.slice(0, 2000) || null, appliedFields: JSON.stringify(applied), createdCustomerId: created ? customerId : null } });
      await tx.adminAuditLog.create({ data: { actorId: session.userId, action: "APPROVE", module: "CUSTOMER_INTAKE", targetType: "CustomerIntakeSubmission", targetId: id, targetLabel: submission.brandName, summary: created ? "审核通过并创建客户" : "审核通过并更新客户", beforeJson: submission.baselinePayload, afterJson: JSON.stringify(updates), metadataJson: JSON.stringify({ customerId, appliedFields: applied }) } });
      return { customerId, created };
    });
    if (result.created) await notifyNewCustomer(result.customerId, submission.brandName);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "审核失败" }, { status: 400 });
  }
}
