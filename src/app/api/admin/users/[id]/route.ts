import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

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
  const { role, status, brandName, newPassword } = body;

  const updateData: Record<string, unknown> = {};
  if (role !== undefined) updateData.role = role;
  if (status !== undefined) updateData.status = status;
  if (brandName !== undefined) updateData.brandName = brandName;
  if (newPassword !== undefined) {
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json({ error: "新密码至少需要 6 位字符" }, { status: 400 });
    }
    updateData.passwordHash = await hashPassword(newPassword);
  }

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

  // Nullify all FK references before deleting to avoid constraint violations.
  await prisma.$transaction([
    prisma.task.updateMany({ where: { ownerId: id }, data: { ownerId: null } }),
    prisma.task.updateMany({ where: { publisherId: id }, data: { publisherId: null } }),
    prisma.reminder.deleteMany({ where: { userId: id } }),
    prisma.salesBatch.updateMany({ where: { uploaderId: id }, data: { uploaderId: null } }),
    prisma.customer.updateMany({ where: { businessOwnerId: id }, data: { businessOwnerId: null } }),
    prisma.customer.updateMany({ where: { backendOwnerId: id }, data: { backendOwnerId: null } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
