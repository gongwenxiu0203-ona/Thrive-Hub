"use server";

import { revalidatePath } from "next/cache";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { convertDocxToPdf } from "@/lib/docxToPdf";
import { stampPdf } from "@/lib/contractStamp";
import { embedPartyBStampMarkers } from "@/lib/stampDocx";
import { findPartyBStampPages } from "@/lib/contractPdfMarkerScan";
import {
  COMPANY_SEALS,
  SEAL_DIR_ABS,
  SealCompany,
  companySealExistsServer,
  resolveSealCompany,
} from "@/lib/contractSeal";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const STAMPED_DIR_ABS = path.join(process.cwd(), "public", "contracts-stamped");
const STAMPED_PREFIX = "/contracts-stamped";

export async function uploadSeal(fd: FormData): Promise<Result<{ fileUrl: string }>> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可上传公章" };

  const company = resolveSealCompany(String(fd.get("sealCompany") ?? ""));
  if (!company) return { ok: false, error: "请选择公章所属公司" };
  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "请选择文件" };
  if (!file.name.toLowerCase().endsWith(".png")) return { ok: false, error: "仅支持 PNG 公章文件" };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "公章 PNG 超过 2MB" };

  await fs.mkdir(SEAL_DIR_ABS, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(COMPANY_SEALS[company].absPath, buf);

  revalidatePath("/contracts/templates");
  return { ok: true, data: { fileUrl: COMPANY_SEALS[company].publicUrl } };
}

async function nextVersionNo(contractId: string): Promise<number> {
  const last = await prisma.contractVersion.findFirst({
    where: { contractId },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  });
  return (last?.versionNo ?? 0) + 1;
}

export async function stampContract(contractId: string, sealCompany?: SealCompany): Promise<Result<{ fileUrl: string }>> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可执行盖章" };

  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, status: true, stampStatus: true },
  });
  if (!c) return { ok: false, error: "合同不存在" };
  if (c.status !== "SIGNING" && c.status !== "COMPLETED") {
    return { ok: false, error: "仅“合同签署中”或“合同签署完成”状态可盖章" };
  }

  const company = resolveSealCompany(sealCompany);
  if (!company) return { ok: false, error: "请选择需要盖章的公司" };
  const sealPath = COMPANY_SEALS[company].absPath;
  const sealLabel = COMPANY_SEALS[company].label;
  if (!(await companySealExistsServer(company))) {
    return { ok: false, error: `未找到${sealLabel}公章 PNG，请先上传 ${COMPANY_SEALS[company].file}` };
  }

  const latest = await prisma.contractVersion.findFirst({
    where: { contractId },
    orderBy: { versionNo: "desc" },
    select: { fileUrl: true, fileType: true },
  });
  if (!latest) return { ok: false, error: "无合同版本可盖章，请先生成或上传合同" };

  try {
    const latestAbs = path.join(process.cwd(), "public", latest.fileUrl.replace(/^\//, ""));
    await fs.access(latestAbs);

    const sealBytes = await fs.readFile(sealPath);
    await fs.mkdir(STAMPED_DIR_ABS, { recursive: true });
    const versionNo = await nextVersionNo(contractId);
    const fileName = `${contractId}-v${versionNo}-stamped.pdf`;
    const outAbs = path.join(STAMPED_DIR_ABS, fileName);

    if (latest.fileType === "pdf") {
      const pdfBytes = await fs.readFile(latestAbs);
      const stamped = await stampPdf(pdfBytes, sealBytes, {
        widthPt: 90,
        insetPt: 36,
        opacity: 0.85,
        corner: "br",
      });
      await fs.writeFile(outAbs, stamped);
    } else {
      const origDocxBytes = await fs.readFile(latestAbs);
      const { buffer: preStamped } = await embedPartyBStampMarkers(origDocxBytes, sealBytes);
      const tmpDocxPath = path.join(STAMPED_DIR_ABS, `${contractId}-v${versionNo}-pre.docx`);
      await fs.writeFile(tmpDocxPath, preStamped);
      try {
        const pdfAbs = await convertDocxToPdf(tmpDocxPath);
        const pdfBytes = await fs.readFile(pdfAbs);
        const skipPages = await findPartyBStampPages(pdfBytes);
        const stamped = await stampPdf(pdfBytes, sealBytes, {
          widthPt: 90,
          insetPt: 36,
          opacity: 0.85,
          corner: "br",
          skipPages,
        });
        await fs.writeFile(outAbs, stamped);
      } catch (convertError) {
        console.warn("[stampContract] LibreOffice conversion failed:", convertError);
        throw new Error("LibreOffice 转换失败，已停止盖章以避免生成乱码合同。请确认服务器已安装 LibreOffice 且 SOFFICE_PATH 正确。");
      } finally {
        try { await fs.unlink(tmpDocxPath); } catch {}
      }
    }

    const fileUrl = `${STAMPED_PREFIX}/${fileName}`;
    await prisma.contractVersion.create({
      data: {
        contractId,
        versionNo,
        fileUrl,
        fileType: "pdf",
        reason: `盖章后归档（${sealLabel}）`,
        createdById: session.userId,
      },
    });
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        stampedDocUrl: fileUrl,
        stampStatus: "STAMPED",
        ...(c.status === "SIGNING" ? { status: "COMPLETED" } : {}),
      },
    });

    revalidatePath(`/contracts/${contractId}`);
    return { ok: true, data: { fileUrl } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "盖章失败";
    await prisma.contract.update({
      where: { id: contractId },
      data: { stampStatus: "FAILED" },
    });
    revalidatePath(`/contracts/${contractId}`);
    return { ok: false, error: msg };
  }
}
