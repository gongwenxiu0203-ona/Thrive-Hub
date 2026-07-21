"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { CUSTOMER_AUTHORIZATION_PLATFORMS } from "@/lib/constants";

export type AuthorizationInfoResult = { ok: true } | { ok: false; error: string };

async function canAccessCustomerAuthorization(customerId: string): Promise<{
  ok: boolean;
  userId: string;
  role: string;
}> {
  const session = await requireSession();
  if (session.role === "ADMIN") return { ok: true, userId: session.userId, role: session.role };
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      businessOwnerId: true,
      backendOwnerId: true,
      channelUserId: true,
      createdById: true,
      deletedAt: true,
    },
  });
  if (!customer || customer.deletedAt) return { ok: false, userId: session.userId, role: session.role };
  const related = [
    customer.businessOwnerId,
    customer.backendOwnerId,
    customer.channelUserId,
    customer.createdById,
  ].includes(session.userId);
  return { ok: related, userId: session.userId, role: session.role };
}

export async function saveCustomerAuthorizationInfo(
  customerId: string,
  fd: FormData,
): Promise<AuthorizationInfoResult> {
  const access = await canAccessCustomerAuthorization(customerId);
  if (!access.ok) return { ok: false, error: "无权编辑客户授权信息" };

  const id = String(fd.get("id") ?? "").trim();
  const platform = String(fd.get("platform") ?? "").trim();
  const accountInfo = String(fd.get("accountInfo") ?? "").trim();
  if (!platform) return { ok: false, error: "请填写平台" };
  if (!CUSTOMER_AUTHORIZATION_PLATFORMS.includes(platform as (typeof CUSTOMER_AUTHORIZATION_PLATFORMS)[number])) {
    return { ok: false, error: "请选择有效的平台" };
  }
  if (!accountInfo) return { ok: false, error: "请填写具体账号信息" };

  if (id) {
    const existing = await (prisma.customerAuthorizationInfo.findUnique as any)({
      where: { id },
      select: { customerId: true },
    });
    if (!existing || existing.customerId !== customerId) {
      return { ok: false, error: "授权信息不存在" };
    }
    await (prisma.customerAuthorizationInfo.update as any)({
      where: { id },
      data: { platform, accountInfo },
    });
  } else {
    await (prisma.customerAuthorizationInfo.create as any)({
      data: {
        customerId,
        platform,
        accountInfo,
        createdById: access.userId,
      },
    });
  }

  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function deleteCustomerAuthorizationInfo(
  customerId: string,
  id: string,
): Promise<AuthorizationInfoResult> {
  const access = await canAccessCustomerAuthorization(customerId);
  if (!access.ok) return { ok: false, error: "无权删除客户授权信息" };

  const existing = await (prisma.customerAuthorizationInfo.findUnique as any)({
    where: { id },
    select: { customerId: true },
  });
  if (!existing || existing.customerId !== customerId) {
    return { ok: false, error: "授权信息不存在" };
  }
  await (prisma.customerAuthorizationInfo.delete as any)({ where: { id } });
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}
