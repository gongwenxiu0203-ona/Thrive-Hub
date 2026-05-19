"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/password";

export async function guestLoginAction() {
  const store = await cookies();
  const token = await createSessionToken({
    userId: "guest",
    name: "游客",
    email: "",
    role: "GUEST",
    status: "APPROVED",
  });
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  redirect("/dashboard");
}

function generateUniqueCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "AM-";
  for (const b of bytes) code += chars[b % chars.length];
  return code;
}

async function setSessionCookie(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  brandName?: string | null;
}) {
  const token = await createSessionToken({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status ?? "APPROVED",
    brandName: user.brandName ?? null,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "请输入邮箱和密码" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "邮箱或密码错误" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = user as any;
  await setSessionCookie({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status ?? "APPROVED",
    brandName: u.brandName ?? null,
  });
  redirect("/dashboard");
}

export async function registerAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const feishuAuth = formData.get("feishuAuth") === "on";
  const googleAuth = formData.get("googleAuth") === "on";
  const emailAuth = formData.get("emailAuth") === "on";
  const identity = String(formData.get("identity") ?? "").trim(); // LYNQ_STAFF | BRAND | CHANNEL
  const brandNameInput = String(formData.get("brandName") ?? "").trim();

  if (!name || !email || !password) {
    return { error: "请填写姓名、邮箱和密码" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "邮箱格式不正确" };
  }
  if (password.length < 6) {
    return { error: "密码至少 6 位" };
  }
  if (password !== confirm) {
    return { error: "两次输入的密码不一致" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "该邮箱已被注册" };
  }

  // Determine role and status based on identity selection
  let role = "LYNQ_STAFF";
  let status = "PENDING";
  let brandName: string | null = null;

  if (identity === "BRAND") {
    role = "BRAND";
    status = "PENDING";
    brandName = brandNameInput || null;
  } else if (identity === "CHANNEL") {
    role = "CHANNEL";
    status = "APPROVED";
  } else {
    // Default: LYNQ_STAFF (or no identity selected)
    role = "LYNQ_STAFF";
    status = "PENDING";
  }

  // Generate a unique user code, retry once on collision
  let uniqueCode = generateUniqueCode();
  const codeExists = await prisma.user.findUnique({ where: { uniqueCode } });
  if (codeExists) uniqueCode = generateUniqueCode();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await (prisma.user.create as any)({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      status,
      feishuAuth,
      googleAuth,
      emailAuth,
      brandName: brandName ?? undefined,
      uniqueCode,
    },
  });

  await setSessionCookie({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status ?? status,
    brandName: user.brandName ?? brandName,
  });

  if (status === "PENDING") {
    redirect("/pending");
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
