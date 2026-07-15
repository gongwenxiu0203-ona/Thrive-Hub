import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  const s = await prisma.customerIntakeSubmission.findUnique({ where: { id }, include: { customer: true, createdCustomer: true, sharedBy: { select: { id: true, name: true, email: true } }, channel: { select: { id: true, name: true, email: true } }, reviewer: { select: { id: true, name: true, email: true } } } });
  if (!s) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  return NextResponse.json({ submission: { ...s, payload: JSON.parse(s.payload), baselinePayload: s.baselinePayload ? JSON.parse(s.baselinePayload) : null, appliedFields: s.appliedFields ? JSON.parse(s.appliedFields) : null } });
}
