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
import { sendMail } from "@/lib/mailer";

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
  const identity = String(formData.get("identity") ?? "").trim(); // USER | BRAND | CHANNEL
  const brandNameInput = String(formData.get("brandName") ?? "").trim();
  const inviter = String(formData.get("inviter") ?? "").trim(); // 邀请人 userId（来自 ?inviter= URL 参数）

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
  let role = "USER";
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
    // Default: USER (内部员工)
    role = "USER";
    status = "PENDING";
  }

  // Generate a unique user code, retry once on collision
  let uniqueCode = generateUniqueCode();
  const codeExists = await prisma.user.findUnique({ where: { uniqueCode } });
  if (codeExists) uniqueCode = generateUniqueCode();

  // 校验邀请人是否存在
  let invitedById: string | null = null;
  if (inviter) {
    const inv = await prisma.user.findUnique({ where: { id: inviter } });
    if (inv) invitedById = inv.id;
  }

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
      invitedById,
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

// ─── Password Reset ────────────────────────────────────────────────────────

/** Step 1: user submits their email to request a reset link. */
export async function forgotPasswordAction(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "请输入有效的邮箱地址" };
  }

  // Look up user — but always return the same success message to prevent
  // email enumeration attacks.
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Replace any existing tokens for this email (idempotent).
    await prisma.passwordResetToken.deleteMany({ where: { email } });
    await prisma.passwordResetToken.create({
      data: { email, token, expiresAt },
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await sendMail({
      to: email,
      subject: "【Thraive联盟营销系统】密码重置申请",
      text:
        `您好 ${user.name}，\n\n` +
        `我们收到了重置您账户密码的请求。\n` +
        `请点击以下链接完成密码重置（链接有效期 1 小时）：\n\n` +
        `${resetUrl}\n\n` +
        `如果您未提交此申请，请忽略本邮件，您的密码不会发生任何变化。\n\n` +
        `—— Thraive联盟营销系统`,
      html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'PingFang SC',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <!-- header -->
        <tr><td style="background:#6366f1;padding:28px 32px;text-align:center">
          <div style="width:48px;height:48px;background:#ffffff22;border-radius:10px;display:inline-block;line-height:48px;font-size:20px;font-weight:700;color:#fff">AM</div>
          <p style="margin:10px 0 0;font-size:15px;color:#e0e7ff;font-weight:500">Thraive联盟营销系统</p>
        </td></tr>
        <!-- body -->
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 12px;font-size:20px;color:#1e293b">密码重置申请</h2>
          <p style="margin:0 0 8px;font-size:14px;color:#475569;line-height:1.7">您好，<strong>${user.name}</strong>，</p>
          <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.7">
            我们收到了重置您账户密码的申请。请点击下方按钮完成密码重置，链接有效期为 <strong>1 小时</strong>。
          </p>
          <div style="text-align:center;margin:0 0 28px">
            <a href="${resetUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:13px 36px;border-radius:8px;font-size:15px;font-weight:600">重置密码</a>
          </div>
          <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;line-height:1.7">
            如果按钮无法点击，请复制以下链接到浏览器：<br>
            <a href="${resetUrl}" style="color:#6366f1;word-break:break-all">${resetUrl}</a>
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.7">
            如果您未提交此申请，请忽略本邮件，您的密码不会发生任何变化。
          </p>
        </td></tr>
        <!-- footer -->
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">© 2025 Thraive联盟营销系统 · 此邮件由系统自动发送，请勿回复</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    }).catch((err) =>
      console.error("[forgotPassword] email send failed:", err),
    );
  }

  // Always return success — prevents revealing whether the email exists.
  return { success: true };
}

/** Step 2: user submits a new password via the token link. */
export async function resetPasswordAction(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "重置链接无效，请重新申请" };
  if (password.length < 6) return { error: "新密码至少需要 6 位字符" };
  if (password !== confirm) return { error: "两次输入的密码不一致" };

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!record || record.expiresAt < new Date()) {
    // Delete expired token if found
    if (record) {
      await prisma.passwordResetToken.delete({ where: { token } }).catch(
        () => {},
      );
    }
    return { error: "重置链接已过期或无效，请重新申请" };
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.update({
    where: { email: record.email },
    data: { passwordHash },
  });

  // Consume the token so it can't be reused
  await prisma.passwordResetToken.delete({ where: { token } }).catch(() => {});

  redirect("/login?reset=1");
}
