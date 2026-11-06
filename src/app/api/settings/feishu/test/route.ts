import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notificationConfig, sendFeishuNotification } from "@/lib/feishuClient";
import { apiError, sameOrigin, withFeishuUser } from "@/lib/feishuOAuth";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return apiError("请求来源不合法", 403);
  return withFeishuUser(async user => {
    const config = notificationConfig();
    const binding = await prisma.feishuBinding.findUnique({ where: { userId: user.id } });
    if (!binding?.enabled || binding.appId !== config.appId || binding.tenantKey !== config.tenantKey) return apiError("请先绑定并启用当前企业的飞书通知");
    const now = new Date();
    const claimed = await prisma.feishuBinding.updateMany({ where: { id: binding.id, enabled: true, OR: [{ lastTestAt: null }, { lastTestAt: { lt: new Date(now.getTime() - 60_000) } }] }, data: { lastTestAt: now } });
    if (!claimed.count) return apiError("请等待60秒后再发送测试消息", 429);
    await sendFeishuNotification(binding.openId, "飞书通知已连接", `${config.baseUrl}/settings`, randomUUID());
    return NextResponse.json({ ok: true });
  });
}
