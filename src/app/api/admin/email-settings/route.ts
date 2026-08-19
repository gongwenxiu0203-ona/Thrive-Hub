import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/appError";
import { writeAdminAudit } from "@/lib/adminObservability";
import {
  EMAIL_REPLY_CATEGORIES,
  isEmailReplyCategory,
  type EmailReplyCategory,
} from "@/lib/emailTemplates";
import { prisma } from "@/lib/prisma";
import { adminHasFeature, getSession } from "@/lib/session";

async function authorize(required: "READ" | "MANAGE") {
  const session = await getSession();
  if (!session) throw new AppError("登录状态已失效，请重新登录", 401, "AUTH_REQUIRED");
  if (session.role !== "ADMIN" || !await adminHasFeature(session, "admin.api_access", required)) {
    throw new AppError("当前账号没有管理邮件配置的权限", 403, "PERMISSION_DENIED");
  }
  return session;
}

export async function GET() {
  try {
    await authorize("READ");
    const [users, settings, logs] = await Promise.all([
      prisma.user.findMany({
        where: { status: "APPROVED", email: { not: "" } },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, email: true, role: true },
      }),
      prisma.emailReplySetting.findMany({
        include: { replyToUser: { select: { id: true, name: true, email: true, role: true, status: true } } },
      }),
      prisma.emailDeliveryLog.findMany({
        take: 30,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          eventKey: true,
          recipientEmail: true,
          status: true,
          errorCode: true,
          errorSummary: true,
          providerMessageId: true,
          createdAt: true,
          sentAt: true,
        },
      }),
    ]);
    return NextResponse.json({
      users,
      settings: Object.fromEntries(settings.map((item) => [item.category, {
        userId: item.replyToUserId,
        enabled: item.enabled,
        user: item.replyToUser,
      }])),
      categories: EMAIL_REPLY_CATEGORIES,
      environment: {
        configured: Boolean(
          process.env.TENCENT_SES_SECRET_ID?.trim()
          && process.env.TENCENT_SES_SECRET_KEY?.trim()
          && process.env.TENCENT_SES_FROM_ADDRESS?.trim()
        ),
        region: process.env.TENCENT_SES_REGION?.trim() || "ap-guangzhou",
        fromAddress: process.env.TENCENT_SES_FROM_ADDRESS?.trim() || "未配置",
        fromName: process.env.TENCENT_SES_FROM_NAME?.trim() || "Thraive 联盟营销",
      },
      logs: logs.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        sentAt: item.sentAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return errorResponse(error, "admin.email-settings.read");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await authorize("MANAGE");
    const body = await request.json().catch(() => null) as { settings?: Record<string, unknown> } | null;
    if (!body?.settings || typeof body.settings !== "object") {
      throw new AppError("邮件配置格式不正确", 400, "EMAIL_SETTINGS_INVALID");
    }
    const requested = new Map<EmailReplyCategory, string | null>();
    for (const category of EMAIL_REPLY_CATEGORIES) {
      const raw = body.settings[category];
      requested.set(category, typeof raw === "string" && raw.trim() ? raw.trim() : null);
    }
    if (!requested.get("DEFAULT")) {
      throw new AppError("必须选择默认回复邮箱", 400, "DEFAULT_REPLY_TO_REQUIRED");
    }
    for (const key of Object.keys(body.settings)) {
      if (!isEmailReplyCategory(key)) throw new AppError(`不支持的邮件配置类型：${key}`, 400, "EMAIL_CATEGORY_INVALID");
    }
    const userIds = [...new Set([...requested.values()].filter((value): value is string => Boolean(value)))];
    const validUsers = await prisma.user.findMany({
      where: { id: { in: userIds }, status: "APPROVED", email: { not: "" } },
      select: { id: true },
    });
    if (validUsers.length !== userIds.length) {
      throw new AppError("所选回复邮箱账号不存在、未审核或未填写邮箱", 400, "REPLY_TO_USER_INVALID");
    }
    const before = await prisma.emailReplySetting.findMany({ select: { category: true, replyToUserId: true } });
    await prisma.$transaction(async (tx) => {
      for (const [category, userId] of requested) {
        if (!userId) {
          await tx.emailReplySetting.deleteMany({ where: { category } });
          continue;
        }
        await tx.emailReplySetting.upsert({
          where: { category },
          create: { category, replyToUserId: userId, updatedById: session.userId },
          update: { replyToUserId: userId, enabled: true, updatedById: session.userId },
        });
      }
    });
    const after = [...requested].map(([category, replyToUserId]) => ({ category, replyToUserId }));
    await writeAdminAudit({
      actorId: session.userId,
      action: "UPDATE_EMAIL_SETTINGS",
      module: "EMAIL",
      targetType: "EmailReplySetting",
      targetLabel: "邮件回复邮箱配置",
      summary: "更新邮件业务的 Reply-To 网站账号",
      before,
      after,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "admin.email-settings.update");
  }
}
