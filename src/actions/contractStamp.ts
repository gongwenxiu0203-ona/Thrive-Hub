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
  SealCompany,
  resolveCompanySealPath,
  resolveSealCompany,
  writeCompanySeal,
} from "@/lib/contractSeal";
import {
  createPrivateContractTempDir,
  resolveContractFilePath,
  writePrivateContractFile,
} from "@/lib/contractFileStorage";
import { isStaff } from "@/lib/permissions";
import {
  FeaturePermissionError,
  requireFeaturePermission,
} from "@/lib/permissionGuard";
import { actionError, AppError } from "@/lib/appError";
import { ensureCustomerReconciliationPlan } from "@/lib/customerReconciliationPlan";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function uploadSeal(fd: FormData): Promise<Result<{ fileUrl: string }>> {
  const session = await requireSession();
  if (!isStaff(session.role)) return { ok: false, error: "无权上传公章" };
  try {
    await requireFeaturePermission(session, "contracts.signing", "MANAGE");
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return { ok: false, error: "无权上传公章" };
    }
    throw error;
  }

  const company = resolveSealCompany(String(fd.get("sealCompany") ?? ""));
  if (!company) return { ok: false, error: "请选择公章所属公司" };
  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "请选择文件" };
  if (!file.name.toLowerCase().endsWith(".png")) return { ok: false, error: "仅支持 PNG 公章文件" };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "公章 PNG 超过 2MB" };

  const buf = Buffer.from(await file.arrayBuffer());
  await writeCompanySeal(company, buf);

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
  const sealPath = await resolveCompanySealPath(company);
  const sealLabel = COMPANY_SEALS[company].label;
  if (!sealPath) {
    return { ok: false, error: `未找到${sealLabel}公章 PNG，请先上传 ${COMPANY_SEALS[company].file}` };
  }

  const latest = await prisma.contractVersion.findFirst({
    where: { contractId },
    orderBy: { versionNo: "desc" },
    select: { fileUrl: true, fileType: true },
  });
  if (!latest) return { ok: false, error: "无合同版本可盖章，请先生成或上传合同" };

  try {
    const latestAbs = await resolveContractFilePath(latest.fileUrl, ["contracts-generated", "contracts-stamped"]);
    if (!latestAbs) throw new AppError("合同版本文件不存在", 404, "CONTRACT_VERSION_FILE_MISSING");

    const sealBytes = await fs.readFile(sealPath);
    const versionNo = await nextVersionNo(contractId);
    const fileName = `${contractId}-v${versionNo}-stamped.pdf`;
    let stamped: Uint8Array;

    if (latest.fileType === "pdf") {
      const pdfBytes = await fs.readFile(latestAbs);
      stamped = await stampPdf(pdfBytes, sealBytes, {
        widthPt: 90,
        insetPt: 36,
        opacity: 0.85,
        corner: "br",
      });
    } else {
      const origDocxBytes = await fs.readFile(latestAbs);
      const { buffer: preStamped } = await embedPartyBStampMarkers(origDocxBytes, sealBytes);
      const tempDir = await createPrivateContractTempDir("contracts-stamped", "stamp-work");
      const tmpDocxPath = path.join(tempDir, `${contractId}-v${versionNo}-pre.docx`);
      await fs.writeFile(tmpDocxPath, preStamped);
      try {
        const pdfAbs = await convertDocxToPdf(tmpDocxPath);
        const pdfBytes = await fs.readFile(pdfAbs);
        const skipPages = await findPartyBStampPages(pdfBytes);
        stamped = await stampPdf(pdfBytes, sealBytes, {
          widthPt: 90,
          insetPt: 36,
          opacity: 0.85,
          corner: "br",
          skipPages,
        });
      } catch (convertError) {
        console.warn("[stampContract] LibreOffice conversion failed:", convertError);
        throw new AppError(
          "LibreOffice 转换失败，已停止盖章以避免生成乱码合同。请确认服务器已安装 LibreOffice 且 SOFFICE_PATH 正确。",
          503,
          "CONTRACT_PDF_CONVERSION_FAILED",
        );
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    const { fileUrl } = await writePrivateContractFile("contracts-stamped", fileName, stamped);
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
    if (c.status === "SIGNING") {
      await ensureCustomerReconciliationPlan(contractId, session.userId);
    }

    revalidatePath(`/contracts/${contractId}`);
    return { ok: true, data: { fileUrl } };
  } catch (e) {
    const tracked = actionError(e, "contract.stamp");
    try {
      await prisma.contract.update({
        where: { id: contractId },
        data: { stampStatus: "FAILED" },
      });
    } catch (statusError) {
      actionError(statusError, "contract.stamp.mark-failed");
    }
    revalidatePath(`/contracts/${contractId}`);
    return tracked;
  }
}
