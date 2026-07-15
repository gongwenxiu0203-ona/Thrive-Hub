import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { reviewNote?: string };
  const submission = await prisma.customerIntakeSubmission.findUnique({ where: { id } });
  if (!submission) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  if (submission.status !== "PENDING") return NextResponse.json({ error: "该记录已处理" }, { status: 409 });
  await prisma.$transaction([
    prisma.customerIntakeSubmission.update({ where: { id }, data: { status: "REJECTED", reviewedById: session.userId, reviewedAt: new Date(), reviewNote: body.reviewNote?.slice(0, 2000) || null } }),
    prisma.adminAuditLog.create({ data: { actorId: session.userId, action: "REJECT", module: "CUSTOMER_INTAKE", targetType: "CustomerIntakeSubmission", targetId: id, targetLabel: submission.brandName, summary: "拒绝外部客户信息提交", metadataJson: JSON.stringify({ reviewNote: body.reviewNote || null }) } }),
  ]);
  return NextResponse.json({ ok: true });
}
