import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { resolveContractFilePath } from "@/lib/contractFileStorage";

type TemplateLike = {
  id: string;
  name: string;
  templateKey: string;
  documentType?: string;
  fileUrl: string;
  deletedAt?: Date | string | null;
};

export type ResolvedContractTemplate = {
  buffer: Buffer;
  templateId: string;
  templateName: string;
  templateKey: string;
  fileUrl: string;
  usedFallback: boolean;
};

async function readTemplateFile(fileUrl: string): Promise<Buffer | null> {
  try {
    const filePath = await resolveContractFilePath(fileUrl, ["contract-templates"]);
    return filePath ? await fs.readFile(filePath) : null;
  } catch {
    return null;
  }
}

export async function resolveContractTemplateBuffer(
  template: TemplateLike | null | undefined,
): Promise<ResolvedContractTemplate | { error: string }> {
  if (!template) return { error: "请先在合同上选择适用的模板" };

  if (!template.deletedAt) {
    const current = await readTemplateFile(template.fileUrl);
    if (current) {
      return {
        buffer: current,
        templateId: template.id,
        templateName: template.name,
        templateKey: template.templateKey,
        fileUrl: template.fileUrl,
        usedFallback: false,
      };
    }
  }

  const candidates = await prisma.contractTemplate.findMany({
    where: { templateKey: template.templateKey, documentType: template.documentType ?? "BRAND_LEGACY" },
    select: {
      id: true,
      name: true,
      templateKey: true,
      fileUrl: true,
      deletedAt: true,
      createdAt: true,
    },
    orderBy: [{ deletedAt: "asc" }, { createdAt: "asc" }],
  });

  for (const candidate of candidates) {
    if (candidate.id === template.id) continue;
    const fallback = await readTemplateFile(candidate.fileUrl);
    if (!fallback) continue;

    return {
      buffer: fallback,
      templateId: candidate.id,
      templateName: candidate.name,
      templateKey: candidate.templateKey,
      fileUrl: candidate.fileUrl,
      usedFallback: true,
    };
  }

  return { error: "读取模板文件失败，请重新上传或选择同类型合同模板" };
}
