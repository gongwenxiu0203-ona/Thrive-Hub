import { NextRequest, NextResponse } from "next/server";
import { adminHasFeature, getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { writeAdminAudit, writeApiAccessLog } from "@/lib/adminObservability";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";

const ALLOWED_ROLES = new Set(["ADMIN", "USER", "BRAND", "CHANNEL"]);

type TransferImpact = {
  key: string;
  label: string;
  count: number;
};

async function requireAdminPermission(required: "READ" | "EDIT" | "MANAGE") {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  if (!await adminHasFeature(session, "admin.users", required)) return { error: NextResponse.json({ error: "当前账号没有执行该用户管理操作的权限" }, { status: 403 }) };
  return { session };
}

async function requireAdminRole() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  if (session.role !== "ADMIN") return { error: NextResponse.json({ error: "该操作仅限系统管理员执行" }, { status: 403 }) };
  return { session };
}

async function hasOtherPermissionAdmin(excludedUserId: string): Promise<boolean> {
  const admins = await prisma.user.findMany({
    where: {
      id: { not: excludedUserId },
      role: "ADMIN",
      status: "APPROVED",
    },
    select: { id: true },
  });
  for (const admin of admins) {
    const level = await resolveUserPermission(admin.id, "admin.permissions");
    if (hasPermissionLevel(level, "MANAGE")) return true;
  }
  return false;
}

async function getTransferImpacts(userId: string) {
  const [
    invitedUsers,
    linkedChannelUsers,
    customers,
    customerAuthorizations,
    contracts,
    contractFieldReviews,
    contractReviews,
    tasks,
    reminders,
    affiliates,
    salesBatches,
    affiliateBatches,
    projects,
    projectGmvTargets,
    projectChannelTargets,
    projectEntries,
    workLogs,
    attachments,
    reconciliations,
    reconciliationReviews,
    settlements,
    channelReconciliations,
    affiliateReconciliations,
    revenueSnapshots,
    accountsReceivable,
    salesPipelines,
    contractTemplates,
    contractVersions,
    bulkOperationLogs,
  ] = await Promise.all([
    prisma.user.count({ where: { invitedById: userId } }),
    prisma.user.count({ where: { channelUserId: userId, NOT: { id: userId } } }),
    prisma.customer.count({ where: { OR: [{ businessOwnerId: userId }, { backendOwnerId: userId }, { channelUserId: userId }, { createdById: userId }] } }),
    prisma.customerAuthorizationInfo.count({ where: { createdById: userId } }),
    prisma.contract.count({ where: { OR: [{ ownerId: userId }, { reviewerId: userId }, { createdById: userId }] } }),
    prisma.contractFieldReview.count({ where: { reviewerId: userId } }),
    prisma.contractReview.count({ where: { reviewerId: userId } }),
    prisma.task.count({ where: { OR: [{ ownerId: userId }, { publisherId: userId }] } }),
    prisma.reminder.count({ where: { OR: [{ targetId: userId }, { createdById: userId }] } }),
    prisma.affiliate.count({ where: { personInChargeId: userId } }),
    prisma.salesBatch.count({ where: { uploaderId: userId } }),
    prisma.affiliateBatch.count({ where: { uploaderId: userId } }),
    prisma.project.count({ where: { OR: [{ ownerId: userId }, { createdById: userId }, { submittedToId: userId }] } }),
    prisma.projectGmvTarget.count({ where: { OR: [{ amOwnerId: userId }, { createdById: userId }] } }),
    prisma.projectChannelTarget.count({ where: { ownerId: userId } }),
    prisma.projectEntry.count({ where: { authorId: userId } }),
    prisma.workLog.count({ where: { authorId: userId } }),
    prisma.attachment.count({ where: { uploadedById: userId } }),
    prisma.customerReconciliation.count({ where: { OR: [{ createdById: userId }, { submittedById: userId }, { submittedToUserId: userId }] } }),
    prisma.reconciliationReview.count({ where: { reviewerId: userId } }),
    prisma.settlement.count({ where: { createdById: userId } }),
    prisma.channelReconciliation.count({ where: { OR: [{ channelUserId: userId }, { createdById: userId }] } }),
    prisma.affiliateReconciliation.count({ where: { submitterId: userId } }),
    prisma.clientRevenueSnapshot.count({ where: { OR: [{ amOwnerId: userId }, { bdOwnerId: userId }] } }),
    prisma.accountsReceivable.count({ where: { followOwnerId: userId } }),
    prisma.salesPipeline.count({ where: { bdOwnerId: userId } }),
    prisma.contractTemplate.count({ where: { uploadedById: userId } }),
    prisma.contractVersion.count({ where: { createdById: userId } }),
    prisma.bulkOperationLog.count({ where: { OR: [{ operatorId: userId }, { revertedById: userId }] } }),
  ]);

  const impacts: TransferImpact[] = [
    { key: "customers", label: "客户及负责人关联", count: customers },
    { key: "contracts", label: "合同及审核", count: contracts + contractFieldReviews + contractReviews },
    { key: "tasks", label: "任务与提醒", count: tasks + reminders },
    { key: "projects", label: "项目、目标与工作日志", count: projects + projectGmvTargets + projectChannelTargets + projectEntries + workLogs },
    { key: "finance", label: "财务对账与结算", count: reconciliations + reconciliationReviews + settlements + channelReconciliations + affiliateReconciliations },
    { key: "bi", label: "推广数据上传批次", count: salesBatches + affiliateBatches },
    { key: "affiliates", label: "联盟商负责人", count: affiliates },
    { key: "operations", label: "经营管理数据", count: revenueSnapshots + accountsReceivable + salesPipelines },
    { key: "files", label: "附件与合同版本", count: attachments + contractTemplates + contractVersions + customerAuthorizations },
    { key: "history", label: "批量操作记录", count: bulkOperationLogs },
    { key: "users", label: "邀请和渠道关联用户", count: invitedUsers + linkedChannelUsers },
  ].filter((impact) => impact.count > 0);

  return {
    impacts,
    total: impacts.reduce((sum, impact) => sum + impact.count, 0),
    requiresChannelRecipient: linkedChannelUsers > 0 || channelReconciliations > 0 || await prisma.customer.count({ where: { channelUserId: userId } }) > 0,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminPermission("READ");
  if (auth.error) return auth.error;

  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  return NextResponse.json({ user: target, ...(await getTransferImpacts(id)) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const auth = await requireAdminRole();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const { role, status, brandName, newPassword } = body;
  const isStatusOnly = status !== undefined
    && role === undefined
    && brandName === undefined
    && newPassword === undefined;
  if (
    !isStatusOnly
    && !await adminHasFeature(auth.session, "admin.users", "EDIT")
  ) {
    return NextResponse.json({ error: "当前账号没有编辑用户资料的权限" }, { status: 403 });
  }
  const previous = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, status: true, brandName: true },
  });
  if (!previous) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (
    status !== undefined
    && previous.status === "PENDING"
    && !await adminHasFeature(auth.session, "admin.registration_review", "EDIT")
  ) {
    return NextResponse.json({ error: "当前账号没有审核注册申请的权限" }, { status: 403 });
  }
  if (
    isStatusOnly
    && previous.status !== "PENDING"
    && !await adminHasFeature(auth.session, "admin.users", "EDIT")
  ) {
    return NextResponse.json({ error: "当前账号没有编辑用户状态的权限" }, { status: 403 });
  }
  const removesPermissionAdmin =
    previous.role === "ADMIN"
    && previous.status === "APPROVED"
    && (role !== undefined && role !== "ADMIN" || status !== undefined && status !== "APPROVED");
  if (removesPermissionAdmin) {
    const currentLevel = await resolveUserPermission(id, "admin.permissions");
    if (hasPermissionLevel(currentLevel, "MANAGE") && !await hasOtherPermissionAdmin(id)) {
      return NextResponse.json(
        { error: "必须保留至少一名已启用且可管理权限的管理员" },
        { status: 409 },
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (role !== undefined) {
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: "角色只能为管理员、内部员工、品牌方或渠道商" }, { status: 400 });
    }
    updateData.role = role;
  }
  if (status !== undefined) updateData.status = status;
  if (brandName !== undefined) updateData.brandName = brandName;
  if (newPassword !== undefined) {
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json({ error: "新密码至少需要 6 位字符" }, { status: 400 });
    }
    updateData.passwordHash = await hashPassword(newPassword);
  }

  const user = await prisma.user.update({ where: { id }, data: updateData });
  await writeAdminAudit({
    actorId: auth.session.userId,
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
    actorId: auth.session.userId,
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
  const auth = await requireAdminPermission("MANAGE");
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const transferToUserId = typeof body?.transferToUserId === "string" ? body.transferToUserId : "";
  if (!transferToUserId) {
    return NextResponse.json({ error: "请先选择接收关联数据的账户" }, { status: 400 });
  }
  if (id === auth.session.userId) {
    return NextResponse.json({ error: "不能移除当前登录账户" }, { status: 400 });
  }
  if (id === transferToUserId) {
    return NextResponse.json({ error: "接收账户不能是待移除账户" }, { status: 400 });
  }

  const [target, recipient, impact] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, status: true, brandName: true } }),
    prisma.user.findUnique({ where: { id: transferToUserId }, select: { id: true, name: true, role: true, status: true } }),
    getTransferImpacts(id),
  ]);
  if (!target) return NextResponse.json({ error: "用户不存在或已被移除" }, { status: 404 });
  if (
    target.role === "ADMIN"
    && target.status === "APPROVED"
    && hasPermissionLevel(await resolveUserPermission(id, "admin.permissions"), "MANAGE")
    && !await hasOtherPermissionAdmin(id)
  ) {
    return NextResponse.json(
      { error: "必须保留至少一名已启用且可管理权限的管理员" },
      { status: 409 },
    );
  }
  if (!recipient || recipient.status !== "APPROVED") {
    return NextResponse.json({ error: "请选择一个已通过审核的接收账户" }, { status: 400 });
  }
  if (impact.requiresChannelRecipient && recipient.role !== "CHANNEL") {
    return NextResponse.json({ error: "该账户关联渠道商数据，请选择渠道商角色的接收账户" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { invitedById: id }, data: { invitedById: recipient.id } });
    await tx.user.updateMany({ where: { channelUserId: id, NOT: { id } }, data: { channelUserId: recipient.id } });

    await tx.customer.updateMany({ where: { businessOwnerId: id }, data: { businessOwnerId: recipient.id } });
    await tx.customer.updateMany({ where: { backendOwnerId: id }, data: { backendOwnerId: recipient.id } });
    await tx.customer.updateMany({ where: { channelUserId: id }, data: { channelUserId: recipient.id } });
    await tx.customer.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });
    await tx.customerAuthorizationInfo.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });

    await tx.contract.updateMany({ where: { ownerId: id }, data: { ownerId: recipient.id } });
    await tx.contract.updateMany({ where: { reviewerId: id }, data: { reviewerId: recipient.id } });
    await tx.contract.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });
    await tx.contractFieldReview.updateMany({ where: { reviewerId: id }, data: { reviewerId: recipient.id } });
    await tx.contractReview.updateMany({ where: { reviewerId: id }, data: { reviewerId: recipient.id } });
    await tx.contractTemplate.updateMany({ where: { uploadedById: id }, data: { uploadedById: recipient.id } });
    await tx.contractVersion.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });

    await tx.task.updateMany({ where: { ownerId: id }, data: { ownerId: recipient.id } });
    await tx.task.updateMany({ where: { publisherId: id }, data: { publisherId: recipient.id } });
    await tx.reminder.updateMany({ where: { targetId: id }, data: { targetId: recipient.id } });
    await tx.reminder.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });

    await tx.affiliate.updateMany({ where: { personInChargeId: id }, data: { personInChargeId: recipient.id } });
    await tx.salesBatch.updateMany({ where: { uploaderId: id }, data: { uploaderId: recipient.id } });
    await tx.affiliateBatch.updateMany({ where: { uploaderId: id }, data: { uploaderId: recipient.id } });
    await tx.bulkOperationLog.updateMany({ where: { operatorId: id }, data: { operatorId: recipient.id } });
    await tx.bulkOperationLog.updateMany({ where: { revertedById: id }, data: { revertedById: recipient.id } });
    await tx.attachment.updateMany({ where: { uploadedById: id }, data: { uploadedById: recipient.id } });

    await tx.project.updateMany({ where: { ownerId: id }, data: { ownerId: recipient.id } });
    await tx.project.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });
    await tx.project.updateMany({ where: { submittedToId: id }, data: { submittedToId: recipient.id } });
    await tx.projectGmvTarget.updateMany({ where: { amOwnerId: id }, data: { amOwnerId: recipient.id } });
    await tx.projectGmvTarget.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });
    await tx.projectChannelTarget.updateMany({ where: { ownerId: id }, data: { ownerId: recipient.id } });
    await tx.projectEntry.updateMany({ where: { authorId: id }, data: { authorId: recipient.id } });
    await tx.workLog.updateMany({ where: { authorId: id }, data: { authorId: recipient.id } });

    await tx.customerReconciliation.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });
    await tx.customerReconciliation.updateMany({ where: { submittedById: id }, data: { submittedById: recipient.id } });
    await tx.customerReconciliation.updateMany({ where: { submittedToUserId: id }, data: { submittedToUserId: recipient.id } });
    await tx.reconciliationReview.updateMany({ where: { reviewerId: id }, data: { reviewerId: recipient.id } });
    await tx.settlement.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });
    await tx.channelReconciliation.updateMany({ where: { channelUserId: id }, data: { channelUserId: recipient.id } });
    await tx.channelReconciliation.updateMany({ where: { createdById: id }, data: { createdById: recipient.id } });
    await tx.affiliateReconciliation.updateMany({ where: { submitterId: id }, data: { submitterId: recipient.id } });

    await tx.clientRevenueSnapshot.updateMany({ where: { amOwnerId: id }, data: { amOwnerId: recipient.id } });
    await tx.clientRevenueSnapshot.updateMany({ where: { bdOwnerId: id }, data: { bdOwnerId: recipient.id } });
    await tx.accountsReceivable.updateMany({ where: { followOwnerId: id }, data: { followOwnerId: recipient.id } });
    await tx.salesPipeline.updateMany({ where: { bdOwnerId: id }, data: { bdOwnerId: recipient.id } });

    await tx.user.delete({ where: { id } });
  });

  await writeAdminAudit({
    actorId: auth.session.userId,
    action: "USER_DELETE",
    module: "ADMIN",
    targetType: "USER",
    targetId: id,
    targetLabel: target.name,
    summary: `移除用户并移交数据：${target.name} -> ${recipient.name}`,
    before: target,
    after: { transferToUserId: recipient.id, transferToUserName: recipient.name, impacts: impact.impacts },
  });
  await writeApiAccessLog({
    actorId: auth.session.userId,
    method: "DELETE",
    route: "/api/admin/users/[id]",
    operation: "管理员移除用户并移交数据",
    statusCode: 200,
    startedAt,
  });

  return NextResponse.json({ ok: true, transferredTo: recipient.name });
}
