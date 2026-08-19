import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/appError";
import { sendTemplateEmail } from "@/lib/emailService";
import { prisma } from "@/lib/prisma";
import { adminHasFeature, getSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) throw new AppError("登录状态已失效，请重新登录", 401, "AUTH_REQUIRED");
    if (session.role !== "ADMIN" || !await adminHasFeature(session, "admin.api_access", "MANAGE")) {
      throw new AppError("当前账号没有发送测试邮件的权限", 403, "PERMISSION_DENIED");
    }
    const body = await request.json().catch(() => null) as { recipientUserId?: string } | null;
    const user = await prisma.user.findFirst({
      where: { id: body?.recipientUserId, status: "APPROVED", email: { not: "" } },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new AppError("请选择有效的测试收件账号", 400, "TEST_RECIPIENT_INVALID");
    const result = await sendTemplateEmail({
      eventKey: "PASSWORD_CHANGED",
      to: user.email,
      variables: {
        name: user.name,
        changed_at: new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date()),
        ip_address: "管理员邮件配置测试",
      },
      createdById: session.userId,
      businessType: "EMAIL_SETTINGS_TEST",
      businessId: user.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "admin.email-settings.test");
  }
}
