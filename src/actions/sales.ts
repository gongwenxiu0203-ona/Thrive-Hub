"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";

export async function deleteBatch(batchId: string) {
  const session = await requireSession();
  if (!isStaff(session.role)) {
    const batch = await prisma.salesBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch || batch.uploaderId !== session.userId) {
      throw new Error("仅上传者或内部员工可删除该批次");
    }
  }
  // 软删除：进回收站（恢复后销售记录仍在；到期物理清理会级联删除记录）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.salesBatch.update as any)({ where: { id: batchId }, data: { deletedAt: new Date() } });
  revalidatePath("/bi");
}

export async function bulkUpdateSalesRecordsCustomer(recordIds: string[], customerId: string | null) {
  const session = await requireSession();
  if (!isStaff(session.role)) throw new Error("仅内部员工可批量修改推广数据关联客户");
  const ids = [...new Set(recordIds.filter(Boolean))];
  if (!ids.length) throw new Error("请选择要修改的数据记录");
  const nextCustomerId = customerId || null;
  let brandName: string | null = null;
  if (nextCustomerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: nextCustomerId, deletedAt: null },
      select: { brandName: true },
    });
    if (!customer) throw new Error("客户不存在或已删除");
    brandName = customer.brandName;
  }
  await prisma.salesRecord.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: {
      customerId: nextCustomerId,
      ...(brandName ? { brand: brandName } : {}),
    },
  });
  revalidatePath("/bi");
}

export async function bulkDeleteSalesRecords(recordIds: string[]) {
  const session = await requireSession();
  if (!isStaff(session.role)) throw new Error("仅内部员工可删除推广数据明细");
  const ids = [...new Set(recordIds.filter(Boolean))];
  if (!ids.length) throw new Error("请选择要删除的数据记录");
  await prisma.salesRecord.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/bi");
  revalidatePath("/recycle-bin");
}
