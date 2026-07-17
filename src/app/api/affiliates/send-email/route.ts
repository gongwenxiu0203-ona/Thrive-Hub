import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { sendMail } from "@/lib/mailer";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";

/** 返回默认发件邮箱（操作用户的注册邮箱）*/
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!hasPermissionLevel(await resolveUserPermission(session.userId, "affiliates"), "READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, name: true },
  });
  return NextResponse.json({ defaultFrom: user?.email ?? "", senderName: user?.name ?? "" });
}

/** 发送邮件给联盟商联系邮箱 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  if (!hasPermissionLevel(await resolveUserPermission(session.userId, "affiliates"), "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const to = String(body.to ?? "").trim();
  const fromEmail = String(body.fromEmail ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const content = String(body.content ?? "").trim();

  if (!to) return NextResponse.json({ error: "缺少收件邮箱" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "请填写邮件主题" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "请填写邮件内容" }, { status: 400 });

  // 操作用户邮箱：作为回复地址 + 抄送（抄送给自己 = 在发送邮箱中留底）
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });
  const operatorEmail = fromEmail || user?.email || "";

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#1e293b;line-height:1.7;white-space:pre-wrap">${escapeHtml(content)}</div>`;

  try {
    await sendMail({
      to,
      subject,
      html,
      text: content,
      replyTo: operatorEmail || undefined,
      cc: operatorEmail || undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[affiliate send-email]", e);
    return NextResponse.json({ error: "邮件发送失败，请检查 SMTP 配置或稍后重试" }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
