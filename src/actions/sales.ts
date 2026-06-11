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
