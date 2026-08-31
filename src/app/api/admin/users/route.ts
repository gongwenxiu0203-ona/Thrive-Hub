import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { adminHasFeature, getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { writeAdminAudit, writeApiAccessLog } from "@/lib/adminObservability";

const ALLOWED_ROLES = new Set(["ADMIN", "USER", "BRAND", "CHANNEL"]);

function generateUniqueCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "AM-";
  for (const b of bytes) code += chars[b % chars.length];
  return code;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (
    !await adminHasFeature(session, "admin.users", "READ")
    && !await adminHasFeature(session, "admin.registration_review", "READ")
    && !await adminHasFeature(session, "admin.permissions", "READ")
  )
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = await (prisma.user.findMany as any)({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
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
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!await adminHasFeature(session, "admin.users", "EDIT"))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await req.json();
  const { name, email, password, role, brandName, phone } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }
  const requestedRole = role ?? "ADMIN";
  if (typeof requestedRole !== "string" || !ALLOWED_ROLES.has(requestedRole)) {
    return NextResponse.json({ error: "角色只能为管理员、内部员工、品牌方或渠道商" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "该邮箱已被注册" }, { status: 409 });
  }

  const uniqueCode = generateUniqueCode();
  const normalizedPhone = typeof phone === "string" ? phone.trim().replace(/[\s()-]/g, "") : "";
  if (normalizedPhone && !/^\+?[0-9]{6,20}$/.test(normalizedPhone)) {
    return NextResponse.json({ error: "联系电话应为6至20位数字，可带国际区号+" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await (prisma.user.create as any)({
    data: {
      name,
      email,
      phone: normalizedPhone || null,
      passwordHash: await hashPassword(password),
      role: requestedRole,
      status: "APPROVED",
      brandName: brandName ?? null,
      uniqueCode,
    },
  });

  await writeAdminAudit({
    actorId: session.userId,
    action: "USER_CREATE",
    module: "ADMIN",
    targetType: "USER",
    targetId: user.id,
    targetLabel: user.name,
    summary: `创建用户：${user.name}`,
    after: { name: user.name, email: user.email, phone: user.phone, role: user.role, status: user.status },
  });
  await writeApiAccessLog({
    actorId: session.userId,
    method: "POST",
    route: "/api/admin/users",
    operation: "管理员创建用户",
    statusCode: 201,
    startedAt,
  });

  return NextResponse.json({ user }, { status: 201 });
}
