import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  await prisma.user.update({ where: { id: session.userId }, data: { name: name.trim() } });
  return NextResponse.json({ ok: true });
}
