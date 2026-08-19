import "server-only";

import { ses } from "tencentcloud-sdk-nodejs-ses";
import { AppError } from "@/lib/appError";
import { prisma } from "@/lib/prisma";
import {
  EMAIL_TEMPLATES,
  emailTemplateId,
  type EmailEventKey,
  type EmailReplyCategory,
} from "@/lib/emailTemplates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export type EmailAttachment = {
  fileName: string;
  content: Buffer;
};

export type SendTemplateEmailInput = {
  eventKey: EmailEventKey;
  to: string;
  variables: Record<string, string | number | null | undefined>;
  createdById?: string | null;
  businessType?: string | null;
  businessId?: string | null;
  idempotencyKey?: string | null;
  attachment?: EmailAttachment;
};

export type SendTemplateEmailResult = {
  logId: string;
  messageId: string | null;
  requestId: string | null;
};

function requiredEnvironment() {
  const secretId = process.env.TENCENT_SES_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_SES_SECRET_KEY?.trim();
  const fromAddress = process.env.TENCENT_SES_FROM_ADDRESS?.trim();
  if (!secretId || !secretKey || !fromAddress) {
    throw new AppError(
      "腾讯云邮件服务尚未完成服务器配置，请联系管理员检查 SES 环境变量",
      503,
      "SES_NOT_CONFIGURED",
    );
  }
  return {
    secretId,
    secretKey,
    fromAddress,
    fromName: process.env.TENCENT_SES_FROM_NAME?.trim() || "Thraive 联盟营销",
    region: process.env.TENCENT_SES_REGION?.trim() || "ap-guangzhou",
  };
}

function normalizeVariables(
  variables: SendTemplateEmailInput["variables"],
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [key, value == null ? "—" : String(value)]),
  );
}

function safeProviderError(error: unknown): { code: string; summary: string } {
  const candidate = error as { code?: unknown; message?: unknown; requestId?: unknown };
  const code = typeof candidate?.code === "string" ? candidate.code.slice(0, 120) : "SES_SEND_FAILED";
  const requestId = typeof candidate?.requestId === "string" ? candidate.requestId : null;
  return {
    code,
    summary: requestId ? `腾讯云请求失败，RequestId：${requestId}` : "腾讯云邮件接口返回发送失败",
  };
}

export async function resolveReplyToEmail(category: EmailReplyCategory): Promise<string> {
  const settings = await prisma.emailReplySetting.findMany({
    where: { category: { in: category === "DEFAULT" ? ["DEFAULT"] : [category, "DEFAULT"] } },
    include: { replyToUser: { select: { email: true, status: true } } },
  });
  const preferred = settings.find((item) => item.category === category && item.enabled)
    ?? settings.find((item) => item.category === "DEFAULT" && item.enabled);
  if (!preferred || preferred.replyToUser.status !== "APPROVED" || !EMAIL_RE.test(preferred.replyToUser.email)) {
    throw new AppError(
      "该邮件类型尚未配置有效的回复邮箱，请管理员先在邮件配置中选择已审核账号",
      409,
      "REPLY_TO_NOT_CONFIGURED",
    );
  }
  return preferred.replyToUser.email.toLowerCase();
}

export async function sendTemplateEmail(
  input: SendTemplateEmailInput,
): Promise<SendTemplateEmailResult> {
  const definition = EMAIL_TEMPLATES[input.eventKey];
  if (!definition) throw new AppError("不支持的邮件模板类型", 400, "EMAIL_EVENT_INVALID");
  const recipient = input.to.trim().toLowerCase();
  if (!EMAIL_RE.test(recipient)) throw new AppError("收件人邮箱格式不正确", 400, "EMAIL_RECIPIENT_INVALID");
  if (input.attachment && input.attachment.content.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new AppError("邮件附件超过腾讯云 4MB 限制，请压缩后重试", 413, "EMAIL_ATTACHMENT_TOO_LARGE");
  }

  if (input.idempotencyKey) {
    const existing = await prisma.emailDeliveryLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing?.status === "SENT") {
      return { logId: existing.id, messageId: existing.providerMessageId, requestId: null };
    }
    if (existing?.status === "PENDING") {
      throw new AppError("该邮件正在发送，请勿重复提交", 409, "EMAIL_ALREADY_SENDING");
    }
  }

  const variables = normalizeVariables(input.variables);
  const templateId = emailTemplateId(input.eventKey);
  const replyTo = await resolveReplyToEmail(definition.category);
  const environment = requiredEnvironment();
  const existingFailed = input.idempotencyKey
    ? await prisma.emailDeliveryLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    : null;
  const log = existingFailed
    ? await prisma.emailDeliveryLog.update({
        where: { id: existingFailed.id },
        data: { status: "PENDING", errorCode: null, errorSummary: null, updatedAt: new Date() },
      })
    : await prisma.emailDeliveryLog.create({
        data: {
          eventKey: input.eventKey,
          templateId,
          recipientEmail: recipient,
          replyToEmail: replyTo,
          businessType: input.businessType ?? null,
          businessId: input.businessId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          createdById: input.createdById ?? null,
        },
      });

  try {
    const Client = ses.v20201002.Client;
    const client = new Client({
      credential: { secretId: environment.secretId, secretKey: environment.secretKey },
      region: environment.region,
      profile: { httpProfile: { endpoint: "ses.tencentcloudapi.com" } },
    });
    const response = await client.SendEmail({
      FromEmailAddress: `${environment.fromName} <${environment.fromAddress}>`,
      Destination: [recipient],
      ReplyToAddresses: replyTo,
      Subject: definition.subject(variables).slice(0, 100),
      Template: { TemplateID: templateId, TemplateData: JSON.stringify(variables) },
      Attachments: input.attachment
        ? [{ FileName: input.attachment.fileName.slice(0, 255), Content: input.attachment.content.toString("base64") }]
        : undefined,
      TriggerType: 1,
      Unsubscribe: "0",
    });
    await prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: {
        status: "SENT",
        providerMessageId: response.MessageId ?? null,
        sentAt: new Date(),
      },
    });
    return {
      logId: log.id,
      messageId: response.MessageId ?? null,
      requestId: response.RequestId ?? null,
    };
  } catch (error) {
    const safe = safeProviderError(error);
    await prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorCode: safe.code, errorSummary: safe.summary },
    }).catch(() => undefined);
    console.error(`[email.send] ${input.eventKey} ${log.id}`, error);
    throw new AppError(
      `邮件发送失败（邮件记录：${log.id}），请联系管理员`,
      502,
      safe.code,
    );
  }
}
