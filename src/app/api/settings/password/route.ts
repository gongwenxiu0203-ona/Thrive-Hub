import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { verifyPassword, hashPassword } from "@/lib/password";

export async function PATCH(req: NextRequest) {
  const session = await requireSession();

  const { currentPassword, newPassword, confirmPassword } = await req.json();

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json({ error: "请填写所有密码字段" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "新密码至少需要 6 位字符" }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "两次输入的新密码不一致" }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "新密码不能与当前密码相同" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "当前密码错误" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return NextResponse.json({ ok: true });
}
