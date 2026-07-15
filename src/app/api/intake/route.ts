import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyIntakeToken } from "@/lib/intakeToken";
import { normalizeIntakePayload } from "@/lib/intakeSubmission";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token : new URL(req.url).searchParams.get("token") ?? "";
  const claims = await verifyIntakeToken(token);
  if (!claims) return NextResponse.json({ error: "链接无效或已过期" }, { status: 401 });
  const data = normalizeIntakePayload(body);
  if (!data.brandName) return NextResponse.json({ error: "请填写品牌/店铺名称" }, { status: 400 });
  if (!data.referrerName) return NextResponse.json({ error: "请填写推荐人" }, { status: 400 });

  let baselinePayload: string | null = null;
  if (claims.type === "CUSTOMER_UPDATE") {
    const routeCustomerId = typeof body.customerId === "string" ? body.customerId : claims.customerId;
    if (!claims.customerId || routeCustomerId !== claims.customerId) return NextResponse.json({ error: "链接与客户不匹配" }, { status: 403 });
    const customer = await prisma.customer.findFirst({ where: { id: claims.customerId, deletedAt: null } });
    if (!customer) return NextResponse.json({ error: "客户不存在" }, { status: 404 });
    baselinePayload = JSON.stringify(Object.fromEntries(Object.keys(data).map((key) => [key, customer[key as keyof typeof customer]])));
  }

  const submission = await prisma.customerIntakeSubmission.create({ data: {
    type: claims.type, brandName: data.brandName, payload: JSON.stringify(data), baselinePayload,
    customerId: claims.type === "CUSTOMER_UPDATE" ? claims.customerId : null,
    sharedByUserId: claims.staffId ?? null, channelUserId: claims.channelId ?? null,
  }});
  return NextResponse.json({ ok: true, submissionId: submission.id, status: "PENDING" }, { status: 202 });
}
