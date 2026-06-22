"use server";

import { revalidatePath } from "next/cache";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { convertDocxToPdf } from "@/lib/docxToPdf";
import { stampPdf } from "@/lib/contractStamp";
import { stampDocx, embedPartyBStampMarkers } from "@/lib/stampDocx";
import { findPartyBStampPages } from "@/lib/contractPdfMarkerScan";
import {
  COMPANY_SEALS,
  SEAL_DIR_ABS,
  SealCompany,
  companySealExistsServer,
  resolveSealCompany,
  sealExistsServer,
} from "@/lib/contractSeal";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const STAMPED_DIR_ABS = path.join(process.cwd(), "public", "contracts-stamped");
const STAMPED_PREFIX  = "/contracts-stamped";

/** Admin uploads / replaces the company seal PNG. */
export async function uploadSeal(fd: FormData): Promise<Result<{ fileUrl: string }>> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可上传公章" };

  const company = resolveSealCompany(String(fd.get("sealCompany") ?? ""));
  if (!company) return { ok: false, error: "请选择公章所属公司" };
  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "请选择文件" };
  if (!file.name.toLowerCase().endsWith(".png")) return { ok: false, error: "仅支持 PNG（建议透明背景）" };
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

/** Stamp the latest version of a contract:
 *  1) Take the latest ContractVersion's file (docx or pdf).
 *  2) If docx → convert via LibreOffice.
 *  3) Overlay the seal on every page (bottom-right).
 *  4) Save as new ContractVersion with reason="盖章后归档" + fileType="pdf".
 *  5) Update contract.stampedDocUrl + stampStatus="STAMPED".
 */
export async function stampContract(contractId: string, sealCompany?: SealCompany): Promise<Result<{ fileUrl: string }>> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可执行盖章" };

  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, status: true, stampStatus: true },
  });
  if (!c) return { ok: false, error: "合同不存在" };
  // 允许在 SIGNING 或 COMPLETED 状态盖章
  if (c.status !== "SIGNING" && c.status !== "COMPLETED") {
    return { ok: false, error: "仅「合同签署中」或「合同签署完成」状态可盖章" };
  }

  const company = resolveSealCompany(sealCompany);
  if (!company) {
    return { ok: false, error: "请选择需要盖章的公司" };
  }
  const sealPath = COMPANY_SEALS[company].absPath;
  const sealLabel = COMPANY_SEALS[company].label;
  if (!(await companySealExistsServer(company))) {
    const legacyOk = await sealExistsServer();
    if (!legacyOk) {
      return { ok: false, error: `未找到${sealLabel}公章 PNG。请先上传或放置 ${COMPANY_SEALS[company].file}。` };
    }
    return { ok: false, error: `未找到${sealLabel}公章 PNG。请将对应公章文件放到 public/seal/${COMPANY_SEALS[company].file}。` };
  }

  const latest = await prisma.contractVersion.findFirst({
    where: { contractId },
    orderBy: { versionNo: "desc" },
    select: { fileUrl: true, fileType: true },
  });
  if (!latest) return { ok: false, error: "无合同版本可盖章。请先生成或上传合同。" };

  try {
    // 1) resolve latest file to disk
    const latestAbs = path.join(process.cwd(), "public", latest.fileUrl.replace(/^\//, ""));
    await fs.access(latestAbs);

    const sealBytes = await fs.readFile(sealPath);
    await fs.mkdir(STAMPED_DIR_ABS, { recursive: true });
    const versionNo = await nextVersionNo(contractId);
    let fileType: "pdf" | "docx" = "pdf";
    let fileName = `${contractId}-v${versionNo}-stamped.pdf`;
    let outAbs = path.join(STAMPED_DIR_ABS, fileName);

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
      // 先把「乙方（盖章）」标记位置的图章嵌进 DOCX，再走 LibreOffice→PDF→bottom-right
      const origDocxBytes = await fs.readFile(latestAbs);
      const { buffer: preStamped } = await embedPartyBStampMarkers(origDocxBytes, sealBytes);
      try {
        // 用预处理后的 DOCX 写一个临时副本喂给 LibreOffice
        const tmpDocxPath = path.join(STAMPED_DIR_ABS, `${contractId}-v${versionNo}-pre.docx`);
        await fs.writeFile(tmpDocxPath, preStamped);
        const pdfAbs = await convertDocxToPdf(tmpDocxPath);
        const pdfBytes = await fs.readFile(pdfAbs);
        // 扫描 PDF 找到包含「乙方（盖章）」的签字页，跳过右下角再盖。
        const skipPages = await findPartyBStampPages(pdfBytes);
        const stamped = await stampPdf(pdfBytes, sealBytes, {
          widthPt: 90,
          insetPt: 36,
          opacity: 0.85,
          corner: "br",
          skipPages,
        });
        await fs.writeFile(outAbs, stamped);
        // 清理临时 DOCX（失败忽略）
        try { await fs.unlink(tmpDocxPath); } catch {}
      } catch (convertError) {
        // LibreOffice 不可用时回退：直接对预处理过的 DOCX 加尾部封章
        const stampedDocx = await stampDocx(preStamped, sealBytes);
        fileType = "docx";
        fileName = `${contractId}-v${versionNo}-stamped.docx`;
        outAbs = path.join(STAMPED_DIR_ABS, fileName);
        await fs.writeFile(outAbs, stampedDocx);
        console.warn("[stampContract] LibreOffice unavailable, generated stamped DOCX fallback:", convertError);
      }
    }

    const fileUrl = `${STAMPED_PREFIX}/${fileName}`;

    await prisma.contractVersion.create({
      data: {
        contractId,
        versionNo,
        fileUrl,
        fileType,
        reason: `盖章后归档（${sealLabel}）`,
        createdById: session.userId,
      },
    });
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        stampedDocUrl: fileUrl,
        stampStatus: "STAMPED",
        // 首次盖章后推进到「签署完成」
        ...(c.status === "SIGNING" ? { status: "COMPLETED" } : {}),
      },
    });

    revalidatePath(`/contracts/${contractId}`);
    return { ok: true, data: { fileUrl } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "盖章失败";
    // record FAILED state so UI shows the issue
    await prisma.contract.update({
      where: { id: contractId },
      data: { stampStatus: "FAILED" },
    });
    revalidatePath(`/contracts/${contractId}`);
    return { ok: false, error: msg };
  }
}
