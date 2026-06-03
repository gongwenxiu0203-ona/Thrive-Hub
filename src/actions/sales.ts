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
  await prisma.salesBatch.delete({ where: { id: batchId } });
  revalidatePath("/bi");
}
