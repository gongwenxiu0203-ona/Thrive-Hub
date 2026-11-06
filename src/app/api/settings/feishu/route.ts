import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notificationConfig } from "@/lib/feishuClient";
import { apiError, sameOrigin, withFeishuUser } from "@/lib/feishuOAuth";
export async function GET() {
  return withFeishuUser(async user => {
  let configured = false;
  try { notificationConfig(); configured = true; } catch { /* Configuration values stay server-only. */ }
  const binding = await prisma.feishuBinding.findUnique({ where: { userId: user.id } });
  const latestDelivery = binding ? await prisma.feishuNotificationDelivery.findFirst({ where: { bindingId: binding.id }, orderBy: { createdAt: "desc" }, select: { status: true, lastError: true, sentAt: true } }) : null;
  return NextResponse.json({ configured, binding: binding ? { displayName: binding.displayName, enabled: binding.enabled, lastTestAt: binding.lastTestAt } : null, latestDelivery }, { headers: { "Cache-Control": "no-store" } });
  });
}
export async function PATCH(req: NextRequest) {
  if (!sameOrigin(req)) return apiError("请求来源不合法", 403);
  return withFeishuUser(async user => {
  let input: unknown; try { input = await req.json(); } catch { return apiError("请求格式不正确"); }
  const enabled = (input as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") return apiError("请选择推送状态");
    if (enabled) notificationConfig();
    await prisma.$transaction(async tx => {
      const binding = await tx.feishuBinding.findUnique({ where: { userId: user.id } });
      if (!binding) throw new Error("请先绑定飞书账号");
      if (binding.enabled === enabled) return;
      await tx.feishuNotificationDelivery.updateMany({ where: { bindingId: binding.id, status: { in: ["PENDING", "PROCESSING", "FAILED"] } }, data: { status: "CANCELLED", leaseToken: null, leaseUntil: null } });
      await tx.feishuBinding.update({ where: { id: binding.id }, data: { enabled, ...(enabled ? { enabledAt: new Date() } : {}) } });
    });
    return NextResponse.json({ ok: true });
  });
}
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return apiError("请求来源不合法", 403);
  return withFeishuUser(async user => {
  await prisma.feishuBinding.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
  });
}
