import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink, realpath } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/appError";
import { authorizeConfirmation, confirmationResponseError, decodeConfirmation } from "@/lib/contractConfirmationStore";
import { saveUploadedFile } from "@/lib/upload";
import { bumpCustomerStatus } from "@/lib/customer";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await authorizeConfirmation(id, "READ");
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id } });
    if (contract.contractMode !== "FRAMEWORK" || !contract.fileUrl) throw new AppError("尚未上传主合同签署原件", 404);
    if (!/^\/uploads\/[a-f0-9-]+\.(pdf|docx|doc)$/i.test(contract.fileUrl)) throw new AppError("签署原件路径无效", 404);
    const root = await realpath(path.join(process.cwd(), "uploads")).catch(() => null);
    if (!root) throw new AppError("签署原件不存在", 404);
    const filePath = await realpath(path.join(root, path.basename(contract.fileUrl))).catch(() => null);
    if (!filePath || !filePath.startsWith(root + path.sep)) throw new AppError("签署原件不存在", 404);
    return new NextResponse(Uint8Array.from(await readFile(filePath)), { headers: {
      "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(contract.contractNo + '-签署原件' + path.extname(filePath))}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return confirmationResponseError(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  let uploaded: string | undefined;
  let persisted = false;
  try {
    const { id } = await params;
    const { session, contract } = await authorizeConfirmation(id, "EDIT");
    if (contract.contractMode !== "FRAMEWORK" || contract.status !== "DRAFT") throw new AppError("仅草稿主合同可上传盖章版完成签署", 409);
    if (Number(request.headers.get("content-length")) > 21 * 1024 * 1024) throw new AppError("文件超过20MB限制", 400);
    const form = await request.formData();
    const confirmationIds = [...new Set(form.getAll("confirmationIds").map(String).map(value => value.trim()).filter(Boolean))];
    if (confirmationIds.length > 50) throw new AppError("一次最多关联50份项目确认书", 400);
    const expected = new Date(String(form.get("expectedUpdatedAt") || ""));
    if (!Number.isFinite(expected.getTime())) throw new AppError("请刷新后重试", 409);
    const reason = String(form.get("reason") || "").trim();
    if (!reason || reason.length > 2000) throw new AppError("请填写归档说明（最多2000字）", 400);
    if (form.get("signedConfirmed") !== "true") throw new AppError("请确认上传文件已由双方签字/盖章", 400);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 20 * 1024 * 1024) throw new AppError("请上传20MB以内的PDF或Word盖章版", 400);
    const ext = path.extname(file.name).toLowerCase();
    const magic = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const valid = ext === ".pdf" ? new TextDecoder().decode(magic).startsWith("%PDF-") : ext === ".docx" ? magic[0] === 0x50 && magic[1] === 0x4b : ext === ".doc" && [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((v,i) => magic[i] === v);
    if (!valid) throw new AppError("文件格式无效，请上传PDF或Word文件", 400);
    uploaded = (await saveUploadedFile(file)).fileUrl;
    const fileUrl = uploaded;
    await prisma.$transaction(async tx => {
      const current = await tx.contract.findFirst({ where: { id, deletedAt: null, contractMode: "FRAMEWORK", status: "DRAFT", updatedAt: expected }, select: { id: true } });
      if (!current) throw new AppError("合同已被修改，请刷新后重试", 409);
      const updated = await tx.contract.updateMany({ where: { id, status: "DRAFT", updatedAt: expected, deletedAt: null }, data: { fileUrl, status: "COMPLETED", uploadArchiveMode: "SIGNED_ARCHIVE" } });
      if (updated.count !== 1) throw new AppError("合同已被修改，请刷新后重试", 409);
      const latest = await tx.contractVersion.aggregate({ where: { contractId: id }, _max: { versionNo: true } });
      await tx.contractVersion.create({ data: { contractId: id, versionNo: (latest._max.versionNo ?? 0) + 1, fileUrl, fileType: ext.slice(1), reason, createdById: session.userId } });
      if (confirmationIds.length) {
        const confirmations = await tx.contractProjectConfirmation.findMany({ where: { id: { in: confirmationIds }, contractId: id, status: "DRAFT" } });
        if (confirmations.length !== confirmationIds.length) throw new AppError("部分项目确认书不存在、已生效或不属于当前主合同，请刷新后重试", 409);
        for (const confirmation of confirmations) {
          const draft = decodeConfirmation(confirmation).draft;
          await tx.contractProjectConfirmation.update({ where: { id: confirmation.id }, data: { signedFileUrl: fileUrl, version: { increment: 1 } } });
          await tx.contractConfirmationVersion.create({ data: { confirmationId: confirmation.id, version: confirmation.version + 1, actorId: session.userId, reason: `与主合同盖章完整版一并归档：${reason}`, snapshot: JSON.stringify({ schemaVersion: 1, data: draft, signedFileUrl: fileUrl, combinedWithFramework: true }) } });
        }
      }
      await tx.financeAuditLog.create({ data: { entityType: "CONTRACT", entityId: id, action: "ARCHIVE_SIGNED_FRAMEWORK", actorId: session.userId, fromStatus: "DRAFT", toStatus: "COMPLETED", note: reason, metadata: JSON.stringify({ fileUrl, signedConfirmed: true, confirmationIds }) } });
    });
    persisted = true;
    if (contract.customerId) await bumpCustomerStatus(contract.customerId, "COOPERATING");
    revalidatePath("/contracts"); revalidatePath(`/contracts/${id}`); revalidatePath(`/contracts/${id}/confirmations`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (uploaded && !persisted) await unlink(path.join(process.cwd(), "uploads", path.basename(uploaded))).catch(() => undefined);
    return confirmationResponseError(error);
  }
}
