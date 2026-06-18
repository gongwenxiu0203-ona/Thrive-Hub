"use server";

import { revalidatePath } from "next/cache";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { convertDocxToPdf } from "@/lib/docxToPdf";
import { stampPdf } from "@/lib/contractStamp";
import { SEAL_DIR_ABS, SEAL_ABS_PATH, SEAL_PUBLIC, sealExistsServer } from "@/lib/contractSeal";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const STAMPED_DIR_ABS = path.join(process.cwd(), "public", "contracts-stamped");
const STAMPED_PREFIX  = "/contracts-stamped";

/** Admin uploads / replaces the company seal PNG. */
export async function uploadSeal(fd: FormData): Promise<Result<{ fileUrl: string }>> {
  const session = await requireSession();
  if (session.role !== "ADMIN") return { ok: false, error: "仅管理员可上传公章" };

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "请选择文件" };
  if (!file.name.toLowerCase().endsWith(".png")) return { ok: false, error: "仅支持 PNG（建议透明背景）" };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "公章 PNG 超过 2MB" };

  await fs.mkdir(SEAL_DIR_ABS, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(SEAL_ABS_PATH, buf);

  revalidatePath("/contracts/templates");
  return { ok: true, data: { fileUrl: SEAL_PUBLIC } };
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
export async function stampContract(contractId: string): Promise<Result<{ fileUrl: string }>> {
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

  if (!(await sealExistsServer())) {
    return { ok: false, error: "未上传公章 PNG。请管理员先在合同模板库上传公章。" };
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

    // 2) ensure we have a PDF
    let pdfAbs: string;
    if (latest.fileType === "pdf") {
      pdfAbs = latestAbs;
    } else {
      // docx → PDF via LibreOffice (writes alongside, we'll move into staged)
      pdfAbs = await convertDocxToPdf(latestAbs);
    }
    const pdfBytes = await fs.readFile(pdfAbs);

    // 3) stamp
    const sealBytes = await fs.readFile(SEAL_ABS_PATH);
    const stamped = await stampPdf(pdfBytes, sealBytes, {
      widthPt: 90,
      insetPt: 36,
      opacity: 0.85,
      corner: "br",
    });

    // 4) save as new version
    await fs.mkdir(STAMPED_DIR_ABS, { recursive: true });
    const versionNo = await nextVersionNo(contractId);
    const fileName = `${contractId}-v${versionNo}-stamped.pdf`;
    const outAbs = path.join(STAMPED_DIR_ABS, fileName);
    await fs.writeFile(outAbs, stamped);
    const fileUrl = `${STAMPED_PREFIX}/${fileName}`;

    await prisma.contractVersion.create({
      data: {
        contractId,
        versionNo,
        fileUrl,
        fileType: "pdf",
        reason: "盖章后归档",
        createdById: session.userId,
      },
    });
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        stampedDocUrl: fileUrl,
        stampStatus: "STAMPED",
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
