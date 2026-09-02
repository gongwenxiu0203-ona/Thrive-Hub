import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/appError";
import { saveUploadedFile } from "@/lib/upload";
import { activateConfirmationReplacement, activateContractConfirmation } from "@/lib/contractConfirmationPlan";
import { authorizeConfirmation, confirmationResponseError, decodeConfirmation, expectedVersion, saveConfirmationDraft, saveConfirmationReplacementDraft } from "@/lib/contractConfirmationStore";

type Context = { params: Promise<{ id: string; confirmationId: string }> };
const extensions = new Set([".pdf", ".docx", ".doc"]);
function storedPath(url: string) {
  if (!/^\/uploads\/[a-f0-9-]+\.(pdf|docx|doc)$/i.test(url)) throw new AppError("文件路径无效", 404);
  return path.join(process.cwd(), "uploads", path.basename(url));
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id, confirmationId } = await context.params;
    await authorizeConfirmation(id, "READ");
    const row = await prisma.contractProjectConfirmation.findFirst({ where: { id: confirmationId, contractId: id } });
    if (!row) throw new AppError("确认书不存在", 404);
    if (request.nextUrl.searchParams.get("download") !== "1") return NextResponse.json({ confirmation: decodeConfirmation(row) });
    if (!row.signedFileUrl) throw new AppError("尚未上传签署文件", 404);
    let bytes;
    try { bytes = await readFile(storedPath(row.signedFileUrl)); } catch { throw new AppError("文件不存在或暂时不可读取", 404); }
    const ext = path.extname(row.signedFileUrl);
    return new NextResponse(bytes, { headers: { "Content-Type": ext === ".pdf" ? "application/pdf" : "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.number + ext)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return confirmationResponseError(error); }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { id, confirmationId } = await context.params;
    const renumber = request.nextUrl.searchParams.get("action") === "renumber";
    const replacement = request.nextUrl.searchParams.get("action") === "replace";
    const { session, contract } = await authorizeConfirmation(id, renumber ? "MANAGE" : "EDIT");
    if (contract.status === "COMPLETED" && session.role !== "ADMIN") throw new AppError("合同签署完成后仅管理员可以修改项目确认书", 403);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("请求格式错误", 400);
    if (renumber) {
      if (session.role !== "ADMIN") throw new AppError("仅管理员可以修改确认书编号", 403);
      const number = typeof body.number === "string" ? body.number.normalize("NFKC").trim().toUpperCase() : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!/^[A-Z0-9][A-Z0-9._-]{0,99}$/.test(number)) throw new AppError("编号须为1至100位字母、数字、点、下划线或短横线", 400);
      if (!reason || reason.length > 2000) throw new AppError("请填写修改原因（最多2000字）", 400);
      const version = expectedVersion(body.expectedVersion);
      const confirmation = await prisma.$transaction(async tx => {
        const current = await tx.contractProjectConfirmation.findFirst({ where: { id: confirmationId, contractId: id, version } });
        if (!current) throw new AppError("确认书版本已变更，请刷新后重试", 409);
        const duplicate = (await tx.contractProjectConfirmation.findMany({ where: { id: { not: confirmationId } }, select: { number: true } })).some(row => row.number.normalize("NFKC").trim().toUpperCase() === number);
        if (duplicate) throw new AppError("确认书编号已存在，不能重复（作废记录仍占用编号）", 409);
        const updated = await tx.contractProjectConfirmation.updateMany({ where: { id: confirmationId, contractId: id, version }, data: { number, version: { increment: 1 } } });
        if (updated.count !== 1) throw new AppError("确认书已被其他人修改", 409);
        await tx.contractConfirmationVersion.create({ data: { confirmationId, version: version + 1, actorId: session.userId, reason, snapshot: JSON.stringify({ ...JSON.parse(current.details), number, previousNumber: current.number, kind: "RENUMBER", signedFileUrl: current.signedFileUrl }) } });
        await tx.financeAuditLog.create({ data: { entityType: "CONTRACT_CONFIRMATION", entityId: confirmationId, action: "CHANGE_NUMBER", actorId: session.userId, note: reason, metadata: JSON.stringify({ contractId: id, oldNumber: current.number, newNumber: number }) } });
        return tx.contractProjectConfirmation.findUniqueOrThrow({ where: { id: confirmationId } });
      });
      return NextResponse.json({ confirmation: decodeConfirmation(confirmation) });
    }
    if (body.draft?.workflowMode === "FORM") {
      if (!body.draft.templateId || !await prisma.contractTemplate.findFirst({ where: { id: body.draft.templateId, documentType: "PROJECT_CONFIRMATION", deletedAt: null }, select: { id: true } })) throw new AppError("在线新建项目确认书必须选择有效的确认书模板", 400);
    }
    if (replacement) {
      const confirmation = await saveConfirmationReplacementDraft(id, confirmationId, session.userId, body.draft, Number(body.pendingVersion), typeof body.reason === "string" ? body.reason : "");
      return NextResponse.json({ confirmation, activated: false, replacement: true });
    }
    const saved = await saveConfirmationDraft(id, session.userId, body.draft, confirmationId, expectedVersion(body.expectedVersion), typeof body.reason === "string" ? body.reason : "");
    // 保存字段不等于完成签署；只有该确认书自己的签署原件上传成功后才会生效。
    return NextResponse.json({ confirmation: decodeConfirmation(saved), activated: false });
  } catch (error) { return confirmationResponseError(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { id, confirmationId } = await context.params;
    const { session, contract } = await authorizeConfirmation(id, "MANAGE");
    if (contract.status === "COMPLETED" && session.role !== "ADMIN") throw new AppError("合同签署完成后仅管理员可以变更项目确认书状态", 403);
    const action = request.nextUrl.searchParams.get("action");
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("请求格式错误", 400);
    const row = await prisma.contractProjectConfirmation.findFirst({ where: { id: confirmationId, contractId: id } });
    if (!row) throw new AppError("确认书不存在", 404);
    if (action === "terminate") {
      if (row.status !== "EFFECTIVE") throw new AppError("只有已签署生效的确认书可以终止", 409);
      const terminationDate = typeof body.terminationDate === "string" ? body.terminationDate.trim() : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(terminationDate)) throw new AppError("请填写有效的终止日期", 400);
      const terminatedAt = new Date(`${terminationDate}T00:00:00.000Z`);
      if (Number.isNaN(terminatedAt.getTime()) || (row.startDate && terminatedAt < row.startDate)) throw new AppError("终止日期不能早于合作开始日期", 400);
      const records = await prisma.customerReconciliation.findMany({ where: { projectConfirmationId: confirmationId, deletedAt: null, planStatus: { not: "CANCELLED" } }, include: { settlements: { select: { status: true } }, billingRequestLines: { select: { id: true }, take: 1 }, receiptAllocations: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 } } });
      const reason = `项目确认书 ${row.number} 于 ${terminationDate} 终止`;
      await prisma.$transaction(async tx => {
        const updated = await tx.contractProjectConfirmation.updateMany({ where: { id: confirmationId, contractId: id, status: "EFFECTIVE", version: row.version }, data: { status: "TERMINATED", terminatedAt, endDate: row.endDate && row.endDate < terminatedAt ? row.endDate : terminatedAt, version: { increment: 1 } } });
        if (updated.count !== 1) throw new AppError("确认书状态已变更，请刷新后重试", 409);
        for (const record of records) {
          const hasFinancialHistory = record.status === "CONFIRMED" || record.settlements.some(item => item.status === "SETTLED") || record.billingRequestLines.length > 0 || record.receiptAllocations.length > 0;
          if (record.periodStart > terminatedAt) await tx.customerReconciliation.update({ where: { id: record.id }, data: { planStatus: "CANCELLED", adjustmentReason: reason } });
          else if (record.periodEnd > terminatedAt && !hasFinancialHistory) await tx.customerReconciliation.update({ where: { id: record.id }, data: { periodEnd: terminatedAt, periodAdjusted: true, adjustmentReason: reason } });
        }
        await tx.financeAuditLog.create({ data: { entityType: "CONTRACT_CONFIRMATION", entityId: confirmationId, action: "TERMINATE", actorId: session.userId, fromStatus: "EFFECTIVE", toStatus: "TERMINATED", note: reason, metadata: JSON.stringify({ contractId: id, terminationDate }) } });
      });
      return NextResponse.json({ ok: true });
    }
    if (action !== "activate") throw new AppError("不支持的操作", 400);
    return NextResponse.json({ result: await activateContractConfirmation(confirmationId, session.userId, expectedVersion(body.expectedVersion)) });
  } catch (error) { return confirmationResponseError(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { id, confirmationId } = await context.params;
    const { session, contract } = await authorizeConfirmation(id, "MANAGE");
    if (contract.status === "COMPLETED" && session.role !== "ADMIN") throw new AppError("合同签署完成后仅管理员可以删除项目确认书草稿", 403);
    const body = await request.json();
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!reason || reason.length > 2000) throw new AppError("请填写删除原因（最多2000字）", 400);
    const row = await prisma.contractProjectConfirmation.findFirst({ where: { id: confirmationId, contractId: id }, include: { _count: { select: { reconciliations: true, invoiceItems: true, billingLines: true, manualBillingItems: true, projects: true, orderAttributions: true } } } });
    if (!row) throw new AppError("确认书不存在", 404);
    if (row.status !== "DRAFT" || Object.values(row._count).some(count => count > 0)) throw new AppError("只有未生效且没有业务关联的草稿可以删除；已生效记录请使用终止", 409);
    await prisma.$transaction(async tx => {
      await tx.financeAuditLog.create({ data: { entityType: "CONTRACT_CONFIRMATION", entityId: confirmationId, action: "DELETE_DRAFT", actorId: session.userId, fromStatus: row.status, note: reason, metadata: JSON.stringify({ contractId: id, number: row.number }) } });
      await tx.contractConfirmationVersion.deleteMany({ where: { confirmationId } });
      await tx.contractConfirmationScope.deleteMany({ where: { confirmationId } });
      await tx.contractProjectConfirmation.delete({ where: { id: confirmationId } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return confirmationResponseError(error); }
}
export async function PUT(request: NextRequest, context: Context) {
  let uploaded: string | undefined;
  let persisted = false;
  try {
    const { id, confirmationId } = await context.params;
    const { session, contract } = await authorizeConfirmation(id, "EDIT");
    if (contract.status === "COMPLETED" && session.role !== "ADMIN") throw new AppError("合同签署完成后仅管理员可以上传或替换项目确认书", 403);
    const replacement = request.nextUrl.searchParams.get("action") === "replace";
    if (Number(request.headers.get("content-length")) > 21 * 1024 * 1024) throw new AppError("文件超过20MB限制", 400);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 20 * 1024 * 1024 || !extensions.has(path.extname(file.name).toLowerCase())) throw new AppError("请上传20MB以内的PDF或Word签署文件", 400);
    const version = replacement ? Number(form.get("expectedVersion")) : expectedVersion(Number(form.get("expectedVersion")));
    if (replacement && (!Number.isInteger(version) || version < 1)) throw new AppError("缺少有效替换草稿版本号，请刷新后重试", 409);
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason || reason.length > 2000) throw new AppError("请填写上传/替换文件原因（最多2000字）", 400);
    const current = await prisma.contractProjectConfirmation.findFirst({ where: replacement
      ? { id: confirmationId, contractId: id, status: "EFFECTIVE", pendingVersion: version, pendingDetails: { not: null } }
      : { id: confirmationId, contractId: id, status: "DRAFT", version } });
    if (!current) throw new AppError("确认书已生效或版本已变更，请刷新后重试", 409);
    // Reject disguised executable files before storing the server-generated filename.
    const magic = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const ext = path.extname(file.name).toLowerCase();
    const valid = ext === ".pdf" ? new TextDecoder().decode(magic).startsWith("%PDF-") : ext === ".docx" ? magic[0] === 0x50 && magic[1] === 0x4b : [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => magic[i] === v);
    if (!valid) throw new AppError("文件内容与扩展名不匹配", 400);
    uploaded = (await saveUploadedFile(file)).fileUrl;
    const fileUrl = uploaded;
    const confirmation = await prisma.$transaction(async tx => {
      if (replacement) {
        const updated = await tx.contractProjectConfirmation.updateMany({ where: { id: confirmationId, contractId: id, status: "EFFECTIVE", pendingVersion: version }, data: { pendingSignedFileUrl: fileUrl, pendingVersion: { increment: 1 } } });
        if (updated.count !== 1) throw new AppError("替换草稿版本已变更，请刷新后重试", 409);
        await tx.financeAuditLog.create({ data: { entityType: "CONTRACT_CONFIRMATION", entityId: confirmationId, action: "UPLOAD_REPLACEMENT_ORIGINAL", actorId: session.userId, note: reason, metadata: JSON.stringify({ contractId: id, pendingVersion: version + 1, fileUrl }) } });
        return tx.contractProjectConfirmation.findUniqueOrThrow({ where: { id: confirmationId } });
      }
      const updated = await tx.contractProjectConfirmation.updateMany({ where: { id: confirmationId, contractId: id, status: "DRAFT", version }, data: { signedFileUrl: fileUrl, version: { increment: 1 } } });
      if (updated.count !== 1) throw new AppError("确认书版本已变更，请刷新后重试", 409);
      await tx.contractConfirmationVersion.create({ data: { confirmationId, version: version + 1, actorId: session.userId, reason, snapshot: JSON.stringify({ schemaVersion: 1, data: decodeConfirmation(current).draft, signedFileUrl: fileUrl }) } });
      return tx.contractProjectConfirmation.findUniqueOrThrow({ where: { id: confirmationId } });
    });
    persisted = true;
    if (replacement) {
      await activateConfirmationReplacement(id, confirmationId, session.userId, confirmation.pendingVersion);
      const effective = await prisma.contractProjectConfirmation.findUniqueOrThrow({ where: { id: confirmationId } });
      return NextResponse.json({ confirmation: decodeConfirmation(effective), activated: true, replacement: true });
    }
    // Whichever creation method was used, uploading the signed original is the
    // explicit final signing action. It immediately locks and activates this version.
    await activateContractConfirmation(confirmationId, session.userId, confirmation.version);
    const effective = await prisma.contractProjectConfirmation.findUniqueOrThrow({ where: { id: confirmationId } });
    return NextResponse.json({ confirmation: decodeConfirmation(effective), activated: true });
  } catch (error) {
    // Only remove this request's new orphan; prior signed files and audit versions remain.
    if (uploaded && !persisted) await unlink(storedPath(uploaded)).catch(() => undefined);
    return confirmationResponseError(error);
  }
}
