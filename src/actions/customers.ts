"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { MAIN_SITES, PROMO_PLATFORMS } from "@/lib/constants";
import { sendOwnerAssignmentNotification } from "@/lib/notify";
import { canDeleteCustomer } from "@/lib/permissions";

export type SaveResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  customerId?: string;
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
    brandName: str(fd, "brandName"),
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
  await requireSession();
  const brandName = name.trim();
  if (!brandName) {
    return {
      ok: false,
      fieldErrors: { brandName: "品牌/店铺名称为必填项" },
    };
  }
  const customer = await prisma.customer.create({
    data: { brandName, source: "INTERNAL" },
  });
  revalidatePath("/customers");
  return { ok: true, customerId: customer.id };
}

export async function createCustomer(fd: FormData): Promise<SaveResult> {
  await requireSession();
  const data = collectCustomerData(fd);
  if (!data.brandName) {
    return {
      ok: false,
      fieldErrors: { brandName: "品牌/店铺名称为必填项" },
    };
  }

  const businessOwnerId = str(fd, "businessOwnerId") || null;
  const backendOwnerId = str(fd, "backendOwnerId") || null;
  const manualStatus = str(fd, "status") || null;       // 手动选择的合作状态
  const demoDueDate = str(fd, "demoDueDate") || null;    // Demo方案截止日期

  const customer = await prisma.customer.create({
    data: {
      ...data,
      businessOwnerId,
      backendOwnerId,
      source: "INTERNAL",
      // 优先使用手动选择的合作状态；否则按是否分配负责人自动判定
      status: manualStatus
        ? manualStatus
        : businessOwnerId || backendOwnerId
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

  revalidatePath("/customers");
  return { ok: true, customerId: customer.id };
}

export async function updateCustomer(
  id: string,
  fd: FormData,
): Promise<SaveResult> {
  await requireSession();
  const data = collectCustomerData(fd);
  if (!data.brandName) {
    return {
      ok: false,
      fieldErrors: { brandName: "品牌/店铺名称为必填项" },
    };
  }
  await prisma.customer.update({ where: { id }, data });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true, customerId: id };
}

export async function deleteCustomer(id: string) {
  const session = await requireSession();
  if (!canDeleteCustomer(session.role)) throw new Error("无权删除客户");
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
  redirect("/customers");
}

/** Manual status change — also resets the timer clock. */
export async function updateCustomerStatus(id: string, status: string) {
  await requireSession();
  await prisma.customer.update({
    where: { id },
    data: { status, statusChangedAt: new Date() },
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
}

/**
 * Assign the business owner. On first assignment auto-creates a
 * "客户会议预约" task for that owner.
 */
export async function setBusinessOwner(customerId: string, userId: string) {
  const session = await requireSession();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer) throw new Error("客户不存在");

  const newOwnerId = userId || null;
  const isNewAssignment = !!newOwnerId && customer.businessOwnerId !== newOwnerId;

  await prisma.customer.update({
    where: { id: customerId },
    data: { businessOwnerId: newOwnerId },
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
  const session = await requireSession();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer) throw new Error("客户不存在");

  const newOwnerId = userId || null;
  const isNewAssignment = !!newOwnerId && customer.backendOwnerId !== newOwnerId;

  await prisma.customer.update({
    where: { id: customerId },
    data: { backendOwnerId: newOwnerId },
  });

  if (isNewAssignment) {
    const existingDemo = await prisma.task.findFirst({
      where: { customerId, category: "DEMO_PLAN" },
    });
    if (existingDemo) {
      await prisma.task.update({
        where: { id: existingDemo.id },
        data: { ownerId: newOwnerId, publisherId: newOwnerId },
      });
    } else {
      await createDemoTask(
        customerId,
        customer.brandName,
        newOwnerId,
        dueDate || null,
      );
      if (customer.status === "UNASSIGNED") {
        await prisma.customer.update({
          where: { id: customerId },
          data: { status: "DEMO_IN_PROGRESS", statusChangedAt: new Date() },
        });
      }
    }
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
  await requireSession();
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
  await requireSession();
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
      description: "系统根据后端负责人指派自动创建，请完成 Demo 推广方案。",
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
  await requireSession();
  if (!customerId) return { ok: false, error: "缺少 customerId" };
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
