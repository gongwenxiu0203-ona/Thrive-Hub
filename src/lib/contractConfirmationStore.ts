import { nextConfirmationNumber } from "./confirmationNumber";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { AppError, errorResponse } from "./appError";
import { getSession, adminHasFeature } from "./session";
import { contractScope } from "./dataScope";
import { confirmationDraftSchema, confirmationDraftSnapshot, confirmationOptionKey, type ContractConfirmationDraft } from "./contractConfirmationDraft";

export async function authorizeConfirmation(contractId: string, level: "READ" | "EDIT" | "MANAGE") {
  const session = await getSession();
  if (!session) throw new AppError("请先登录", 401);
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, status: true } });
  if (!user || !["ADMIN", "USER"].includes(user.role) || user.role !== session.role || user.status !== "APPROVED" || !await adminHasFeature(session, "contracts.records", level)) throw new AppError("无此合同操作权限", 403);
  const contract = await prisma.contract.findFirst({ where: { id: contractId, deletedAt: null, ...contractScope(session, "all"), type: "BRAND", customer: { deletedAt: null } }, select: { id: true, contractNo: true, contractMode: true, type: true, status: true, uploadType: true, fileUrl: true, customerId: true, partyA: true, partyAContact: true, partyAEmail: true, partyAPhone: true, partyBContact: true, partyBEmail: true, partyBPhone: true, customer: { select: { id: true, brandName: true } } } });
  if (!contract) throw new AppError("品牌方合同或关联客户不存在", 404);
  return { session, contract };
}

export function confirmationResponseError(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "请求或确认书数据格式错误" }, { status: 400 });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => i.message).join("；") }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "确认书编号已存在，请刷新后重试" }, { status: 409 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) return NextResponse.json({ error: "项目确认书数据结构尚未就绪，请先完成数据库迁移" }, { status: 503 });
  return errorResponse(error, "contracts.confirmations");
}

export function decodeConfirmation<T extends { details: string; pendingDetails?: string | null }>(row: T) {
  const snapshot = JSON.parse(row.details);
  const pendingSnapshot = row.pendingDetails ? JSON.parse(row.pendingDetails) : null;
  return { ...row, draft: confirmationDraftSchema.parse(snapshot.data), pendingDraft: pendingSnapshot ? confirmationDraftSchema.parse(pendingSnapshot.data) : null };
}

export function expectedVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new AppError("缺少有效版本号，请刷新后重试", 409);
  return value;
}

async function validateAccounts(tx: Prisma.TransactionClient, contractId: string, draft: ContractConfirmationDraft) {
  const contracted = await tx.contractReceivingAccount.findMany({
    where: { contractId, financeProfileId: { in: draft.receivingAccountIds } },
    select: { financeProfileId: true },
  });
  const allowed = new Set(contracted.map((row) => row.financeProfileId).filter(Boolean));
  if (draft.receivingAccountIds.some((id) => !allowed.has(id))) {
    throw new AppError("乙方收款账户必须选自主格式合同已约定的账户", 400);
  }
  const count = await tx.financeAccountProfile.count({ where: { id: { in: draft.receivingAccountIds }, accountType: { in: ["COMPANY_PAYER", "COMPANY_BANK"] }, status: "ACTIVE" } });
  if (count !== draft.receivingAccountIds.length) throw new AppError("乙方收款账户已停用或不存在，请重新选择", 400);
}

async function storeOptions(tx: Prisma.TransactionClient, draft: ContractConfirmationDraft, actorId: string) {
  const values: [string, string][] = draft.scopes.flatMap(scope => [
    ["COUNTRY", scope.country] as [string, string],
    ...scope.salesPlatforms.map(v => ["SALES_PLATFORM", v] as [string, string]),
    ...scope.programs.map(v => ["PROGRAM", v] as [string, string]),
    ...scope.thirdPartyPlatforms.map(v => ["THIRD_PARTY_PLATFORM", v] as [string, string]),
  ]);
  values.push(...draft.salesSources.map(v => ["SALES_SOURCE", v] as [string, string]));
  for (const [category, value] of values) {
    const normalizedValue = confirmationOptionKey(value);
    await tx.contractCustomOption.upsert({ where: { category_normalizedValue: { category, normalizedValue } }, create: { category, value, normalizedValue, createdById: actorId }, update: {} });
  }
}

export async function saveConfirmationDraft(contractId: string, actorId: string, input: unknown, id?: string, version?: number, reason = "新建确认书草稿") {
  const draft = confirmationDraftSchema.parse(input);
  if (draft.contractId !== contractId) throw new AppError("确认书与主合同不匹配", 400);
  if (!reason.trim() || reason.length > 2000) throw new AppError("请填写修改原因（最多2000字）", 400);
  return prisma.$transaction(async tx => {
    const contract = await tx.contract.findFirst({ where: { id: contractId, type: "BRAND", deletedAt: null, customer: { deletedAt: null } }, select: { id: true, contractNo: true } });
    if (!contract) throw new AppError("合同或客户不存在", 404);
    await validateAccounts(tx, contractId, draft);
    const existing = id ? await tx.contractProjectConfirmation.findFirst({ where: { id, contractId } }) : null;
    if (id && !existing) throw new AppError("确认书不存在", 404);
    const number = existing?.number ?? nextConfirmationNumber(contract.contractNo, (await tx.contractProjectConfirmation.findMany({ where: { number: { startsWith: `${contract.contractNo}-` } }, select: { number: true } })).map(row => row.number));
    draft.title = number;
    const data = { title: number, startDate: draft.startDate ? new Date(draft.startDate + "T00:00:00Z") : null, endDate: draft.endDate ? new Date(draft.endDate + "T00:00:00Z") : null, details: confirmationDraftSnapshot(draft) };
    let confirmation;
    if (id) {
      const signedContentChanged = Boolean(existing?.signedFileUrl && existing.details !== data.details);
      const updated = await tx.contractProjectConfirmation.updateMany({ where: { id, contractId, status: "DRAFT", version: expectedVersion(version) }, data: { ...data, ...(signedContentChanged ? { signedFileUrl: null } : {}), version: { increment: 1 } } });
      if (updated.count !== 1) throw new AppError("确认书已生效或被他人修改，请刷新后重试", 409);
      confirmation = await tx.contractProjectConfirmation.findUniqueOrThrow({ where: { id } });
      if (signedContentChanged) await tx.financeAuditLog.create({ data: { entityType: "CONTRACT_CONFIRMATION", entityId: id, action: "INVALIDATE_SIGNED_FILE", actorId, note: "确认书字段已修改，原签署文件保留在历史版本中；生效前必须重新上传对应盖章版", metadata: JSON.stringify({ contractId, previousSignedFileUrl: existing!.signedFileUrl }) } });
    } else {
      confirmation = await tx.contractProjectConfirmation.create({ data: { ...data, contractId, number, createdById: actorId } });
    }
    await tx.contractConfirmationVersion.create({ data: { confirmationId: confirmation.id, version: confirmation.version, snapshot: JSON.stringify({ schemaVersion: 1, data: draft, signedFileUrl: confirmation.signedFileUrl }), reason: reason.trim(), actorId } });
    // Draft ranges remain in immutable version snapshots. The activation service
    // materializes current scope rows once, so historical scopes are never erased.
    await storeOptions(tx, draft, actorId);
    return decodeConfirmation(confirmation);
  });
}

export async function saveConfirmationReplacementDraft(
  contractId: string, confirmationId: string, actorId: string, input: unknown,
  pendingVersion: number, reason = "建立确认书替换版本",
) {
  const draft = confirmationDraftSchema.parse(input);
  if (draft.contractId !== contractId) throw new AppError("确认书与主合同不匹配", 400);
  if (!reason.trim() || reason.length > 2000) throw new AppError("请填写替换原因（最多2000字）", 400);
  return prisma.$transaction(async (tx) => {
    const current = await tx.contractProjectConfirmation.findFirst({ where: { id: confirmationId, contractId, status: "EFFECTIVE" } });
    if (!current) throw new AppError("只有已签署生效的确认书可以建立替换版本", 409);
    if (current.pendingVersion !== pendingVersion) throw new AppError("替换草稿已被其他人修改，请刷新后重试", 409);
    await validateAccounts(tx, contractId, draft);
    const details = confirmationDraftSnapshot({ ...draft, title: current.number });
    const contentChanged = Boolean(current.pendingSignedFileUrl && current.pendingDetails !== details);
    const updated = await tx.contractProjectConfirmation.updateMany({
      where: { id: confirmationId, contractId, status: "EFFECTIVE", pendingVersion },
      data: { pendingDetails: details, ...(contentChanged ? { pendingSignedFileUrl: null } : {}), pendingVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new AppError("替换草稿已被其他人修改，请刷新后重试", 409);
    await storeOptions(tx, draft, actorId);
    await tx.financeAuditLog.create({ data: {
      entityType: "CONTRACT_CONFIRMATION", entityId: confirmationId, action: "SAVE_REPLACEMENT_DRAFT", actorId,
      note: reason.trim(), metadata: JSON.stringify({ contractId, activeVersion: current.version, pendingVersion: pendingVersion + 1, signedFileInvalidated: contentChanged }),
    } });
    return decodeConfirmation(await tx.contractProjectConfirmation.findUniqueOrThrow({ where: { id: confirmationId } }));
  });
}
