"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function deleteBatch(batchId: string) {
  const session = await requireSession();
  if (session.role !== "ADMIN") {
    const batch = await prisma.salesBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch || batch.uploaderId !== session.userId) {
      throw new Error("仅上传者或管理员可删除该批次");
    }
  }
  await prisma.salesBatch.delete({ where: { id: batchId } });
  revalidatePath("/bi");
}
