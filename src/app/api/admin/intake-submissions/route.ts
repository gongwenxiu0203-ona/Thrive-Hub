import { NextResponse } from "next/server";
import { adminHasFeature, getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!await adminHasFeature(session, "intake.review", "READ")) return NextResponse.json({ error: "当前账号没有查看客户资料审核的权限" }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const where = { ...(status && ["PENDING", "APPROVED", "REJECTED"].includes(status) ? { status } : {}), ...(type && ["GENERAL_NEW", "CUSTOMER_UPDATE"].includes(type) ? { type } : {}) };
  const [submissions, customers] = await Promise.all([
    prisma.customerIntakeSubmission.findMany({ where, orderBy: { submittedAt: "desc" }, include: {
      customer: { select: { id: true, brandName: true } }, createdCustomer: { select: { id: true, brandName: true } },
      sharedBy: { select: { id: true, name: true, email: true } }, channel: { select: { id: true, name: true, email: true } }, reviewer: { select: { id: true, name: true, email: true } },
    }}),
    prisma.customer.findMany({
      where: { deletedAt: null },
      select: { id: true, brandName: true },
      orderBy: { brandName: "asc" },
    }),
  ]);
  return NextResponse.json({
    submissions: submissions.map((s) => ({ ...s, payload: JSON.parse(s.payload), baselinePayload: s.baselinePayload ? JSON.parse(s.baselinePayload) : null, appliedFields: s.appliedFields ? JSON.parse(s.appliedFields) : null })),
    customers,
  });
}
