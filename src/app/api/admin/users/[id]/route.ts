import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

function isAdmin(role: string) {
  return role === "ADMIN";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(session.role))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { role, status, brandName } = body;

  const updateData: Record<string, unknown> = {};
  if (role !== undefined) updateData.role = role;
  if (status !== undefined) updateData.status = status;
  if (brandName !== undefined) updateData.brandName = brandName;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await (prisma.user.update as any)({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ user });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(session.role))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;

  // Prevent self-deletion
  if (id === session.userId) {
    return NextResponse.json({ error: "不能删除自己的账号" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
