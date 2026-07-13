import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { writeAdminAudit, writeApiAccessLog } from "@/lib/adminObservability";

function isAdmin(role: string) {
  return role === "ADMIN";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(session.role))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { role, status, brandName, newPassword } = body;
  const previous = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, status: true, brandName: true },
  });

  const updateData: Record<string, unknown> = {};
  if (role !== undefined) updateData.role = role;
  if (status !== undefined) updateData.status = status;
  if (brandName !== undefined) updateData.brandName = brandName;
  if (newPassword !== undefined) {
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json({ error: "新密码至少需要 6 位字符" }, { status: 400 });
    }
    updateData.passwordHash = await hashPassword(newPassword);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await (prisma.user.update as any)({
    where: { id },
    data: updateData,
  });

  await writeAdminAudit({
    actorId: session.userId,
    action: "USER_UPDATE",
    module: "ADMIN",
    targetType: "USER",
    targetId: user.id,
    targetLabel: user.name,
    summary: `更新用户：${user.name}`,
    before: previous,
    after: { name: user.name, email: user.email, role: user.role, status: user.status, brandName: user.brandName, passwordChanged: newPassword !== undefined },
  });
  await writeApiAccessLog({
    actorId: session.userId,
    method: "PATCH",
    route: "/api/admin/users/[id]",
    operation: "管理员更新用户",
    statusCode: 200,
    startedAt,
  });

  return NextResponse.json({ user });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isAdmin(session.role))
    return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, status: true, brandName: true },
  });

  // Prevent self-deletion
  if (id === session.userId) {
    return NextResponse.json({ error: "不能删除自己的账号" }, { status: 400 });
  }

  // Nullify / reassign all FK references before deleting to avoid constraint violations.
  await prisma.$transaction(async (tx) => {
    const adminId = session.userId;

    // ── Self-referential User fields ──────────────────────────────
    await tx.user.updateMany({ where: { invitedById: id }, data: { invitedById: null } });
    await tx.user.updateMany({ where: { channelUserId: id }, data: { channelUserId: null } });

    // ── Tasks ─────────────────────────────────────────────────────
    await tx.task.updateMany({ where: { ownerId: id }, data: { ownerId: null } });
    await tx.task.updateMany({ where: { publisherId: id }, data: { publisherId: null } });

    // ── Reminders: delete all targeting or created by this user ───
    await tx.reminder.deleteMany({ where: { targetId: id } });
    await tx.reminder.deleteMany({ where: { createdById: id } });

    // ── Customers ─────────────────────────────────────────────────
    await tx.customer.updateMany({ where: { businessOwnerId: id }, data: { businessOwnerId: null } });
    await tx.customer.updateMany({ where: { backendOwnerId: id }, data: { backendOwnerId: null } });
    await tx.customer.updateMany({ where: { channelUserId: id }, data: { channelUserId: null } });
    await tx.customer.updateMany({ where: { createdById: id }, data: { createdById: null } });

    // ── Contracts ─────────────────────────────────────────────────
    await tx.contract.updateMany({ where: { ownerId: id }, data: { ownerId: null } });
    await tx.contract.updateMany({ where: { reviewerId: id }, data: { reviewerId: null } });
    await tx.contract.updateMany({ where: { createdById: id }, data: { createdById: adminId } });
    await tx.contractFieldReview.updateMany({ where: { reviewerId: id }, data: { reviewerId: null } });

    // ── Sales ─────────────────────────────────────────────────────
    await tx.salesBatch.updateMany({ where: { uploaderId: id }, data: { uploaderId: adminId } });

    // ── Affiliates ────────────────────────────────────────────────
    await tx.affiliateBatch.updateMany({ where: { uploaderId: id }, data: { uploaderId: adminId } });

    // ── Finance: CustomerReconciliation + reviews ─────────────────
    await tx.customerReconciliation.updateMany({ where: { createdById: id }, data: { createdById: adminId } });
    await tx.customerReconciliation.updateMany({ where: { reviewerId: id }, data: { reviewerId: adminId } });
    await tx.reconciliationReview.updateMany({ where: { reviewerId: id }, data: { reviewerId: adminId } });

    // ── Finance: Settlement ───────────────────────────────────────
    await tx.settlement.updateMany({ where: { createdById: id }, data: { createdById: adminId } });

    // ── Finance: ChannelReconciliation ────────────────────────────
    await tx.channelReconciliation.updateMany({ where: { channelUserId: id }, data: { channelUserId: adminId } });
    await tx.channelReconciliation.updateMany({ where: { createdById: id }, data: { createdById: adminId } });

    // ── Finally delete the user (UserPermissionOverride cascade) ──
    await tx.user.delete({ where: { id } });
  });

  await writeAdminAudit({
    actorId: session.userId,
    action: "USER_DELETE",
    module: "ADMIN",
    targetType: "USER",
    targetId: id,
    targetLabel: target?.name ?? null,
    summary: `删除用户：${target?.name ?? id}`,
    before: target,
  });
  await writeApiAccessLog({
    actorId: session.userId,
    method: "DELETE",
    route: "/api/admin/users/[id]",
    operation: "管理员删除用户",
    statusCode: 200,
    startedAt,
  });

  return NextResponse.json({ ok: true });
}
