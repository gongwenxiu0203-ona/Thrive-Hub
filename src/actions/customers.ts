"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { MAIN_SITES, PROMO_PLATFORMS, isCustomerStatus } from "@/lib/constants";
import { sendOwnerAssignmentNotification } from "@/lib/notify";
import { canDeleteCustomer, isStaff } from "@/lib/permissions";
import { bumpCustomerStatus, capitalizeBrandName } from "@/lib/customer";
import { customerScope } from "@/lib/dataScope";
import { requireFeaturePermission } from "@/lib/permissionGuard";

const LEO_EMAIL = "leo.g@thraiveagency.com";
const LEDO_EMAIL = "ledo.h@thraiveagency.com";

async function requireCustomerPermission(
  feature: "customers.records" | "customers.followup",
  required: "EDIT" | "MANAGE" = "EDIT",
) {
  const session = await requireSession();
  await requireFeaturePermission(session, feature, required);
  return session;
}

async function requireCustomerEditSession() {
  return requireCustomerPermission("customers.records");
}

async function requireCustomerFollowupSession() {
  return requireCustomerPermission("customers.followup");
}

async function requireCustomerManageSession() {
  return requireCustomerPermission("customers.records", "MANAGE");
}

function accessibleCustomerWhere(session: Awaited<ReturnType<typeof requireSession>>) {
  return customerScope(session, session.role === "ADMIN" ? "all" : "mine");
}

/** Find a user id by exact email; returns null if missing (silent fallback). */
async function userIdByEmail(email: string): Promise<string | null> {
  const u = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  return u?.id ?? null;
}

/** After customer create: notify Leo with a task + in-app reminder.
 *  Idempotent per customer (skips if a "客户分配" task already exists for Leo). */
async function notifyLeoOnCustomerCreate(customerId: string, brandName: string): Promise<void> {
  const leoId = await userIdByEmail(LEO_EMAIL);
  if (!leoId) return;
  const exists = await prisma.task.findFirst({
    where: { customerId, ownerId: leoId, category: "FOLLOWUP", title: { startsWith: "客户分配" } },
    select: { id: true },
  });
  if (!exists) {
    const count = await prisma.task.count({ where: { status: "TODO" } });
    await prisma.task.create({
      data: {
        title: `客户分配 · ${brandName}`,
        description: "新客户创建，请跟进处理客户分配事宜。",
        customerId,
        ownerId: leoId,
        publisherId: leoId,
        priority: "MID",
        category: "FOLLOWUP",
        status: "TODO",
        sortOrder: count,
      },
    });
  }
  await prisma.reminder.create({
    data: {
      title: `新客户分配：${brandName}`,
      content: `客户「${brandName}」已创建，请处理客户分配。`,
      remindDate: new Date(),
      type: "FOLLOWUP",
      targetId: leoId,
      createdById: leoId,
    },
  });
}

export type SaveResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  customerId?: string;
};

export type CustomerDeleteImpact = {
  customerName: string;
  groups: { key: string; label: string; count: number }[];
};

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

// Collect the four-section fields shared by create & update.
function collectCustomerData(fd: FormData) {
  const mainSites = MAIN_SITES.filter((s) => fd.get(`site_${s}`) === "on");
  const siteLinks: Record<
    string,
    { link: string; price: string; asin: string }
  > = {};
  for (const s of mainSites) {
    siteLinks[s] = {
      link: str(fd, `siteLink_${s}`),
      price: str(fd, `sitePrice_${s}`),
      asin: str(fd, `siteAsin_${s}`),
    };
  }

  const targetPlatforms = PROMO_PLATFORMS.filter(
    (p) => fd.get(`platform_${p}`) === "on",
  );
  const platformGmv: Record<string, string> = {};
  for (const p of targetPlatforms) {
    platformGmv[p] = str(fd, `platformGmv_${p}`);
  }

  const promotionGoals = fd.getAll("promotionGoals").map(String);

  return {
    brandName: capitalizeBrandName(str(fd, "brandName")),
    referrerName: str(fd, "referrerName") || null,
    mainSites: JSON.stringify(mainSites),
    siteLinks: JSON.stringify(siteLinks),
    competitor: str(fd, "competitor") || null,
    targetPlatforms: JSON.stringify(targetPlatforms),
    platformGmv: JSON.stringify(platformGmv),
    amazonAcos: str(fd, "amazonAcos") || null,
    amazonAcosNote: str(fd, "amazonAcosNote") || null,
    socialMediaInfo: str(fd, "socialMediaInfo") || null,
    affiliateHistory: str(fd, "affiliateHistory") || null,
    affiliatePlatforms: str(fd, "affiliatePlatforms") || null,
    promotionGoals: JSON.stringify(promotionGoals),
    targetGmv: str(fd, "targetGmv") || null,
    channelBudget: str(fd, "channelBudget") || null,
    affiliateTeam: str(fd, "affiliateTeam") || null,
    category: str(fd, "category") || null,
    rating: str(fd, "rating") || "PENDING",
    contactName: str(fd, "contactName") || null,
    contactEmail: str(fd, "contactEmail") || null,
    contactPhone: str(fd, "contactPhone") || null,
  };
}

/** Quick create — only the brand/shop name is required. */
export async function quickCreateCustomer(name: string): Promise<SaveResult> {
  const session = await requireCustomerEditSession();
  const brandName = capitalizeBrandName(name);
  if (!brandName) {
    return {
      ok: false,
      fieldErrors: { brandName: "品牌/店铺名称为必填项" },
    };
  }
  // If no owner can be auto-identified, default to ledo.h (fall back to creator).
  const ledoId = await userIdByEmail(LEDO_EMAIL);
  const defaultBusinessOwnerId = ledoId ?? session.userId;
  const customer = await prisma.customer.create({
    data: {
      brandName,
      source: "INTERNAL",
      createdById: session.userId,
      businessOwnerId: defaultBusinessOwnerId,
    },
  });
  if (defaultBusinessOwnerId) {
    await createMeetingTask(customer.id, customer.brandName, defaultBusinessOwnerId);
  }
  await notifyLeoOnCustomerCreate(customer.id, customer.brandName);
  revalidatePath("/customers");
  revalidatePath("/tasks");
  return { ok: true, customerId: customer.id };
}

export async function createCustomer(fd: FormData): Promise<SaveResult> {
  const session = await requireCustomerEditSession();
  const data = collectCustomerData(fd);
  if (!data.brandName) {
    return {
      ok: false,
      fieldErrors: { brandName: "品牌/店铺名称为必填项" },
    };
  }

  let businessOwnerId = str(fd, "businessOwnerId") || null;
  const backendOwnerId = str(fd, "backendOwnerId") || null;
  const manualStatus = str(fd, "status") || null;       // 手动选择的合作状态
  const demoDueDate = str(fd, "demoDueDate") || null;    // Demo方案截止日期
  if (manualStatus && !isCustomerStatus(manualStatus)) {
    return { ok: false, error: "无效的客户进度" };
  }

  // 如果用户没选商务负责人，默认填充 ledo.h（无法识别时回退到创建人）
  if (!businessOwnerId) {
    const ledoId = await userIdByEmail(LEDO_EMAIL);
    businessOwnerId = ledoId ?? session.userId;
  }

  const customer = await prisma.customer.create({
    data: {
      ...data,
      businessOwnerId,
      backendOwnerId,
      createdById: session.userId,
      // 无论是否分配售前方案负责人，只要选了日期就保存到客户记录
      demoDueDate: demoDueDate ? new Date(demoDueDate) : null,
      source: "INTERNAL",
      // 优先使用手动选择的合作状态；否则按是否分配负责人自动判定
      status: manualStatus
        ? manualStatus
        : backendOwnerId
          ? "DEMO_IN_PROGRESS"
          : "UNASSIGNED",
    },
  });

  if (businessOwnerId) {
    await createMeetingTask(customer.id, customer.brandName, businessOwnerId);
  }
  if (backendOwnerId) {
    // 使用创建时填写的截止日期，避免在详情页二次选择
    await createDemoTask(customer.id, customer.brandName, backendOwnerId, demoDueDate);
  }
  await notifyLeoOnCustomerCreate(customer.id, customer.brandName);

  revalidatePath("/customers");
  revalidatePath("/tasks");
  return { ok: true, customerId: customer.id };
}

export async function updateCustomer(
  id: string,
  fd: FormData,
): Promise<SaveResult> {
  const session = await requireCustomerEditSession();
  const data = collectCustomerData(fd);
  if (!data.brandName) {
    return {
      ok: false,
      fieldErrors: { brandName: "品牌/店铺名称为必填项" },
    };
  }
  const updateData: Partial<typeof data> = { ...data };
  if (!isStaff(session.role)) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { channelUserId: true, createdById: true },
    });
    if (
      session.role !== "CHANNEL" ||
      !customer ||
      (customer.channelUserId !== session.userId &&
        customer.createdById !== session.userId)
    ) {
      return { ok: false, error: "无权编辑该客户" };
    }
    delete updateData.category;
    delete updateData.rating;
  }
  await prisma.customer.update({ where: { id }, data: updateData });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true, customerId: id };
}

export async function deleteCustomer(id: string) {
  const session = await requireCustomerManageSession();
  if (!canDeleteCustomer(session.role)) throw new Error("无权删除客户");
  // 软删除：标记 deletedAt，进回收站，7 天内可恢复，到期物理清理。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.customer.update as any)({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/customers");
  redirect("/customers");
}

/** Manual status change — also resets the timer clock. */
export async function getCustomerDeleteImpact(id: string): Promise<CustomerDeleteImpact> {
  const session = await requireCustomerManageSession();
  if (!canDeleteCustomer(session.role)) throw new Error("无权删除客户");

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { brandName: true },
  });
  if (!customer) throw new Error("客户不存在");

  const [
    contracts,
    tasks,
    projects,
    reconciliations,
    accountsReceivable,
    salesBatches,
    salesRecords,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.contract.count as any)({ where: { customerId: id, deletedAt: null } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.task.count as any)({ where: { customerId: id, deletedAt: null } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.project.count as any)({ where: { customerId: id, deletedAt: null } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.customerReconciliation.count as any)({ where: { customerId: id, deletedAt: null } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.accountsReceivable.count as any)({ where: { customerId: id } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.salesBatch.count as any)({ where: { customerId: id, deletedAt: null } }),
    prisma.salesRecord.count({ where: { customerId: id, deletedAt: null } }),
  ]);

  return {
    customerName: customer.brandName,
    groups: [
      { key: "contracts", label: "关联合同", count: contracts },
      { key: "tasks", label: "关联任务", count: tasks },
      { key: "projects", label: "关联项目", count: projects },
      { key: "reconciliations", label: "客户收入对账", count: reconciliations },
      { key: "accountsReceivable", label: "应收账款（解除客户关联）", count: accountsReceivable },
      { key: "salesBatches", label: "推广数据批次", count: salesBatches },
      { key: "salesRecords", label: "推广数据明细关联", count: salesRecords },
    ],
  };
}

export async function getBulkCustomerDeleteImpact(ids: string[]): Promise<CustomerDeleteImpact[]> {
  const session = await requireCustomerManageSession();
  if (!canDeleteCustomer(session.role)) throw new Error("无权删除客户");
  const cleanIds = [...new Set(ids.filter(Boolean))];
  if (!cleanIds.length) return [];
  return Promise.all(cleanIds.map((id) => getCustomerDeleteImpact(id)));
}

export async function deleteCustomerWithRelations(id: string) {
  const session = await requireCustomerManageSession();
  if (!canDeleteCustomer(session.role)) throw new Error("无权删除客户");
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.contract.updateMany as any)({ where: { customerId: id, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.task.updateMany as any)({ where: { customerId: id, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.project.updateMany as any)({ where: { customerId: id, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.customerReconciliation.updateMany as any)({ where: { customerId: id, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.accountsReceivable.updateMany as any)({ where: { customerId: id }, data: { customerId: null } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.salesBatch.updateMany as any)({ where: { customerId: id, deletedAt: null }, data: { deletedAt: now } });
    await tx.salesRecord.updateMany({ where: { customerId: id, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.customer.update as any)({ where: { id }, data: { deletedAt: now } });
  });

  revalidatePath("/customers");
  revalidatePath("/contracts");
  revalidatePath("/finance");
  revalidatePath("/operations");
  revalidatePath("/projects");
  revalidatePath("/tasks");
  revalidatePath("/bi");
  revalidatePath("/recycle-bin");
  redirect("/customers");
}

export async function bulkDeleteCustomersWithRelations(ids: string[]): Promise<SaveResult> {
  const session = await requireCustomerManageSession();
  if (!canDeleteCustomer(session.role)) return { ok: false, error: "无权删除客户" };
  const cleanIds = [...new Set(ids.filter(Boolean))];
  if (!cleanIds.length) return { ok: false, error: "请选择要删除的客户" };
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.contract.updateMany as any)({ where: { customerId: { in: cleanIds }, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.task.updateMany as any)({ where: { customerId: { in: cleanIds }, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.project.updateMany as any)({ where: { customerId: { in: cleanIds }, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.customerReconciliation.updateMany as any)({ where: { customerId: { in: cleanIds }, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.accountsReceivable.updateMany as any)({ where: { customerId: { in: cleanIds } }, data: { customerId: null } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.salesBatch.updateMany as any)({ where: { customerId: { in: cleanIds }, deletedAt: null }, data: { deletedAt: now } });
    await tx.salesRecord.updateMany({ where: { customerId: { in: cleanIds }, deletedAt: null }, data: { deletedAt: now } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx.customer.updateMany as any)({ where: { id: { in: cleanIds }, deletedAt: null }, data: { deletedAt: now } });
  });

  revalidatePath("/customers");
  revalidatePath("/contracts");
  revalidatePath("/finance");
  revalidatePath("/operations");
  revalidatePath("/projects");
  revalidatePath("/tasks");
  revalidatePath("/bi");
  revalidatePath("/recycle-bin");
  return { ok: true };
}

export async function bulkUpdateCustomers(
  ids: string[],
  patch: {
    status?: string;
    rating?: string;
    targetPlatforms?: string[];
    businessOwnerId?: string | null;
    backendOwnerId?: string | null;
  },
): Promise<SaveResult> {
  const session = await requireCustomerEditSession();
  if (
    patch.status !== undefined ||
    patch.businessOwnerId !== undefined ||
    patch.backendOwnerId !== undefined
  ) {
    await requireFeaturePermission(session, "customers.followup", "EDIT");
  }
  const cleanIds = [...new Set(ids.filter(Boolean))];
  if (!cleanIds.length) return { ok: false, error: "请选择要修改的客户" };
  const accessibleCount = await prisma.customer.count({
    where: {
      AND: [
        { id: { in: cleanIds }, deletedAt: null },
        accessibleCustomerWhere(session),
      ],
    },
  });
  if (accessibleCount !== cleanIds.length) return { ok: false, error: "部分客户不存在或无权修改" };

  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    if (!isCustomerStatus(patch.status)) return { ok: false, error: "无效的客户进度" };
    data.status = patch.status;
    data.statusChangedAt = new Date();
    data.staleReviewDeadlineAt = null;
  }
  if (patch.rating !== undefined) data.rating = patch.rating;
  if (patch.targetPlatforms !== undefined) {
    const platforms = PROMO_PLATFORMS.filter((p) => patch.targetPlatforms?.includes(p));
    data.targetPlatforms = JSON.stringify(platforms);
  }
  if (patch.businessOwnerId !== undefined) data.businessOwnerId = patch.businessOwnerId || null;
  if (patch.backendOwnerId !== undefined) data.backendOwnerId = patch.backendOwnerId || null;
  if (Object.keys(data).length === 0) return { ok: false, error: "请选择要批量修改的字段" };

  await prisma.customer.updateMany({
    where: {
      AND: [
        { id: { in: cleanIds }, deletedAt: null },
        accessibleCustomerWhere(session),
      ],
    },
    data,
  });
  revalidatePath("/customers");
  return { ok: true };
}

export async function updateCustomerStatus(id: string, status: string) {
  const session = await requireCustomerFollowupSession();
  if (!isCustomerStatus(status)) throw new Error("无效的客户进度");
  const customer = await prisma.customer.findFirst({
    where: { AND: [{ id, deletedAt: null }, accessibleCustomerWhere(session)] },
    select: { id: true },
  });
  if (!customer) throw new Error("客户不存在或无权修改");
  await prisma.customer.update({
    where: { id: customer.id },
    data: { status, statusChangedAt: new Date(), staleReviewDeadlineAt: null },
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
}

/**
 * Assign the business owner. On first assignment auto-creates a
 * "客户会议预约" task for that owner.
 */
export async function setBusinessOwner(customerId: string, userId: string) {
  const session = await requireCustomerFollowupSession();
  const customer = await prisma.customer.findFirst({
    where: { AND: [{ id: customerId, deletedAt: null }, accessibleCustomerWhere(session)] },
  });
  if (!customer) throw new Error("客户不存在或无权修改");

  const newOwnerId = userId || null;
  const isNewAssignment = !!newOwnerId && customer.businessOwnerId !== newOwnerId;

  await prisma.customer.update({
    where: { id: customerId },
    data: { businessOwnerId: newOwnerId, staleReviewDeadlineAt: null },
  });

  if (isNewAssignment) {
    const existingMeeting = await prisma.task.findFirst({
      where: { customerId, category: "MEETING_BOOKING" },
    });
    if (existingMeeting) {
      // Update existing task owner to match the new business owner
      await prisma.task.update({
        where: { id: existingMeeting.id },
        data: { ownerId: newOwnerId, publisherId: newOwnerId },
      });
    } else {
      await createMeetingTask(customerId, customer.brandName, newOwnerId);
    }
    await sendOwnerAssignmentNotification({
      ownerId: newOwnerId,
      ownerRole: "business",
      customerId,
      customerName: customer.brandName,
      assignedById: session.userId,
    });
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

/**
 * Assign the backend owner. On first assignment auto-creates a
 * "Demo方案制定" task; only the due date needs to be picked manually.
 */
export async function setBackendOwner(
  customerId: string,
  userId: string,
  dueDate: string,
) {
  const session = await requireCustomerFollowupSession();
  const customer = await prisma.customer.findFirst({
    where: { AND: [{ id: customerId, deletedAt: null }, accessibleCustomerWhere(session)] },
  });
  if (!customer) throw new Error("客户不存在或无权修改");

  const newOwnerId = userId || null;
  const isNewAssignment = !!newOwnerId && customer.backendOwnerId !== newOwnerId;

  // 截止日期优先用传入值，否则用客户记录里已保存的 demoDueDate（创建时填的）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storedDue = (customer as any).demoDueDate as Date | null | undefined;
  const effectiveDue = dueDate || (storedDue ? new Date(storedDue).toISOString().slice(0, 10) : null);

  // 如果本次传入了新日期，同步更新客户记录里的 demoDueDate
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      backendOwnerId: newOwnerId,
      staleReviewDeadlineAt: null,
      ...(dueDate ? { demoDueDate: new Date(dueDate) } : {}),
    },
  });

  if (isNewAssignment) {
    const existingDemo = await prisma.task.findFirst({
      where: { customerId, category: "DEMO_PLAN" },
    });
    if (existingDemo) {
      await prisma.task.update({
        where: { id: existingDemo.id },
        data: {
          ownerId: newOwnerId,
          publisherId: newOwnerId,
          ...(effectiveDue ? { dueDate: new Date(effectiveDue) } : {}),
        },
      });
    } else {
      await createDemoTask(
        customerId,
        customer.brandName,
        newOwnerId,
        effectiveDue,
      );
    }
    await bumpCustomerStatus(customerId, "DEMO_IN_PROGRESS");
    await sendOwnerAssignmentNotification({
      ownerId: newOwnerId,
      ownerRole: "backend",
      customerId,
      customerName: customer.brandName,
      assignedById: session.userId,
    });
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/tasks");
}

/** Save evaluation scores and auto-set the rating grade. */
export async function saveEvaluation(
  customerId: string,
  evalData: object | null,
  grade: string,
) {
  const session = await requireCustomerEditSession();
  const customer = await prisma.customer.findFirst({
    where: {
      AND: [{ id: customerId, deletedAt: null }, accessibleCustomerWhere(session)],
    },
    select: { id: true },
  });
  if (!customer) throw new Error("客户不存在或无权修改");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.customer.update as any)({
    where: { id: customerId },
    data: {
      evaluationData: evalData ? JSON.stringify(evalData) : null,
      rating: grade,
    },
  });
  revalidatePath(`/customers/${customerId}`);
}

/** Assign (or clear) the channel user for this customer. */
export async function setChannelUser(customerId: string, userId: string) {
  const session = await requireCustomerEditSession();
  const customer = await prisma.customer.findFirst({
    where: {
      AND: [{ id: customerId, deletedAt: null }, accessibleCustomerWhere(session)],
    },
    select: { id: true },
  });
  if (!customer) throw new Error("客户不存在或无权修改");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.customer.update as any)({
    where: { id: customerId },
    data: { channelUserId: userId || null },
  });
  revalidatePath(`/customers/${customerId}`);
}

// ---- internal task factories ---------------------------------------------

async function createDemoTask(
  customerId: string,
  brandName: string,
  ownerId: string,
  dueDate: string | null,
) {
  const count = await prisma.task.count({ where: { status: "TODO" } });
  await prisma.task.create({
    data: {
      title: `${brandName} Demo方案制定`,
      description: "系统根据售前方案负责人指派自动创建，请完成 Demo 推广方案。",
      customerId,
      ownerId,
      publisherId: ownerId,
      priority: "HIGH",
      category: "DEMO_PLAN",
      status: "TODO",
      dueDate: dueDate ? new Date(dueDate) : null,
      sortOrder: count,
    },
  });
}

async function createMeetingTask(
  customerId: string,
  brandName: string,
  ownerId: string,
) {
  const count = await prisma.task.count({ where: { status: "TODO" } });
  await prisma.task.create({
    data: {
      title: `客户会议预约 · ${brandName}`,
      description:
        "系统根据商务负责人指派自动创建。请填写会议时间、参会人员、线上/线下方式（线下需填写地点），提交后将同步至参会人日历。",
      customerId,
      ownerId,
      publisherId: ownerId,
      priority: "MID",
      category: "MEETING_BOOKING",
      status: "TODO",
      sortOrder: count,
    },
  });
}

/**
 * 财务对账"新建客户对账"专用：更新客户的负责人和联系电话
 * 由 NewReconciliationModal 调用，仅写入这两个字段
 */
export async function setupFinanceCustomerOwner(
  customerId: string,
  businessOwnerId: string,
  contactPhone: string,
): Promise<SaveResult> {
  const session = await requireCustomerFollowupSession();
  if (!customerId) return { ok: false, error: "缺少 customerId" };
  const customer = await prisma.customer.findFirst({
    where: {
      AND: [{ id: customerId, deletedAt: null }, accessibleCustomerWhere(session)],
    },
    select: { id: true },
  });
  if (!customer) return { ok: false, error: "客户不存在或无权修改" };
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      businessOwnerId: businessOwnerId || null,
      contactPhone: contactPhone?.trim() || null,
    },
  });
  revalidatePath(`/finance/customers/${customerId}`);
  revalidatePath("/finance");
  return { ok: true, customerId };
}
