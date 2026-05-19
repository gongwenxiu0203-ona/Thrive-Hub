import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

function generateUniqueCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "AM-";
  for (const b of bytes) code += chars[b % chars.length];
  return code;
}

function isAdmin(role: string) {
  return role === "ADMIN";
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(session.role))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = await (prisma.user.findMany as any)({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      brandName: true,
      uniqueCode: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(session.role))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await req.json();
  const { name, email, password, role, brandName } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "该邮箱已被注册" }, { status: 409 });
  }

  const uniqueCode = generateUniqueCode();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await (prisma.user.create as any)({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: role ?? "ADMIN",
      status: "APPROVED",
      brandName: brandName ?? null,
      uniqueCode,
    },
  });

  return NextResponse.json({ user }, { status: 201 });
}
