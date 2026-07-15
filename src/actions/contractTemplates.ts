"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { TEMPLATE_KEYS } from "@/lib/contractTemplateKeys";
import { writePrivateContractFile } from "@/lib/contractFileStorage";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/** Upload a new contract template (admin only). Stores under private/contract-templates/<id>.docx
 *  Returns the new template's id on success. */
export async function uploadContractTemplate(fd: FormData): Promise<Result<{ id: string }>> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可上传合同模板" };

  const file = fd.get("file");
  const name = String(fd.get("name") ?? "").trim();
  const templateKey = String(fd.get("templateKey") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();

  if (!(file instanceof File)) return { ok: false, error: "请选择文件" };
  if (!name) return { ok: false, error: "请填写模板名称" };
  if (!TEMPLATE_KEYS.includes(templateKey)) return { ok: false, error: "请选择佣金机制类型" };
  if (!file.name.toLowerCase().endsWith(".docx")) return { ok: false, error: "仅支持 .docx 文件" };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "文件超过 20MB" };

  // Create row first so we have the id for the filename
  const row = await prisma.contractTemplate.create({
    data: {
      name,
      templateKey,
      fileUrl: "", // patched below
      description: description || null,
      uploadedById: session.userId,
    },
  });

  const fileName = `${row.id}.docx`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { fileUrl } = await writePrivateContractFile("contract-templates", fileName, buf);
  await prisma.contractTemplate.update({ where: { id: row.id }, data: { fileUrl } });

  revalidatePath("/contracts");
  revalidatePath("/contracts/templates");
  return { ok: true, data: { id: row.id } };
}

/** Soft-delete a contract template (admin only). Keeps the file on disk so any
 *  contract that already references it can still download. */
export async function deleteContractTemplate(id: string): Promise<Result> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可删除合同模板" };
  await prisma.contractTemplate.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/contracts/templates");
  return { ok: true };
}

/** Restore a soft-deleted template. */
export async function restoreContractTemplate(id: string): Promise<Result> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可恢复合同模板" };
  await prisma.contractTemplate.update({
    where: { id },
    data: { deletedAt: null },
  });
  revalidatePath("/contracts/templates");
  return { ok: true };
}
