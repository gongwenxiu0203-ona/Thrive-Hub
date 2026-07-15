import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createIntakeToken } from "@/lib/intakeToken";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.status !== "APPROVED") return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { customerId?: string };
  const customerId = typeof body.customerId === "string" ? body.customerId : undefined;
  let channelId: string | undefined;
  let staffId: string | undefined;
  if (session.role === "CHANNEL") channelId = session.userId;
  else if (["ADMIN", "USER"].includes(session.role)) staffId = session.userId;
  else return NextResponse.json({ error: "无权生成分享链接" }, { status: 403 });

  if (customerId) {
    const where = session.role === "CHANNEL"
      ? { id: customerId, deletedAt: null, OR: [{ channelUserId: session.userId }, { createdById: session.userId }] }
      : { id: customerId, deletedAt: null };
    const customer = await prisma.customer.findFirst({ where, select: { id: true } });
    if (!customer) return NextResponse.json({ error: "客户不存在或无权访问" }, { status: 404 });
  }
  const ttl = customerId ? 60 * 60 * 24 * 180 : 60 * 60 * 24 * 365;
  const token = await createIntakeToken({ type: customerId ? "CUSTOMER_UPDATE" : "GENERAL_NEW", customerId, staffId, channelId }, ttl);
  const path = customerId ? `/intake/${customerId}` : "/intake";
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return NextResponse.json({ token, url: `${base}${path}?token=${encodeURIComponent(token)}`, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() });
}
