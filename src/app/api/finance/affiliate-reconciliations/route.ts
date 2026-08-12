import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "登录状态已失效，请重新登录后再操作" }, { status: 401 });

  const records = await prisma.affiliateReconciliation.findMany({
    include: {
      submitter: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(records);
}
