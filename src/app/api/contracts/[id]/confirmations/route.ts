import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/appError";
import { adminHasFeature } from "@/lib/session";
import { authorizeConfirmation, confirmationResponseError, decodeConfirmation, saveConfirmationDraft } from "@/lib/contractConfirmationStore";
import { finalizeExistingUploadedConfirmation } from "@/lib/contractConfirmationPlan";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const { contract, session } = await authorizeConfirmation(id, "READ");
    const contractedAccounts = await prisma.contractReceivingAccount.findMany({
      where: { contractId: id, financeProfileId: { not: null } },
      select: { financeProfileId: true },
      orderBy: { position: "asc" },
    });
    const accountIds = contractedAccounts
      .map((row) => row.financeProfileId)
      .filter((value): value is string => Boolean(value));
    const [rows, bankAccounts, options, canEdit, canManage, users, confirmationTemplates] = await Promise.all([
      prisma.contractProjectConfirmation.findMany({ where: { contractId: id }, orderBy: { createdAt: "asc" }, include: { versions: { orderBy: { version: "desc" }, select: { version: true, actorId: true, reason: true, createdAt: true } } } }),
      prisma.financeAccountProfile.findMany({ where: { id: { in: accountIds }, accountType: { in: ["COMPANY_PAYER", "COMPANY_BANK"] }, status: "ACTIVE" }, select: { id: true, name: true, accountName: true, accountNumber: true, legalEntity: true, bankName: true, swiftCode: true, bankAddress: true, currency: true }, orderBy: { name: "asc" } }),
      prisma.contractCustomOption.findMany({ select: { category: true, value: true }, orderBy: { value: "asc" } }),
      adminHasFeature(session, "contracts.records", "EDIT").then((allowed) => allowed && (contract.status !== "COMPLETED" || session.role === "ADMIN")), adminHasFeature(session, "contracts.records", "MANAGE"),
      prisma.user.findMany({ where: { role: { in: ["ADMIN", "USER"] }, status: "APPROVED" }, select: { id: true, name: true, email: true, phone: true }, orderBy: { name: "asc" } }),
      prisma.contractTemplate.findMany({ where: { documentType: "PROJECT_CONFIRMATION", deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
    ]);
    return NextResponse.json({ contract, confirmations: rows.map(decodeConfirmation), bankAccounts, options, confirmationTemplates, canEdit, canManage, users, canRenumber: session.role === "ADMIN" && canManage }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return confirmationResponseError(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const { session, contract } = await authorizeConfirmation(id, "EDIT");
    if (contract.status === "COMPLETED" && session.role !== "ADMIN") throw new AppError("合同签署完成后仅管理员可以新增项目确认书", 403);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("请求格式错误", 400);
    if (body.draft?.workflowMode === "FORM") {
      if (!body.draft.templateId || !await prisma.contractTemplate.findFirst({ where: { id: body.draft.templateId, documentType: "PROJECT_CONFIRMATION", deletedAt: null }, select: { id: true } })) throw new AppError("在线新建项目确认书必须选择有效的确认书模板", 400);
    }
    const priorCount = await prisma.contractProjectConfirmation.count({ where: { contractId: id } });
    const saved = await saveConfirmationDraft(id, session.userId, body.draft);
    const result = priorCount === 0
      ? await finalizeExistingUploadedConfirmation(id, saved.id, session.userId, saved.version)
      : { confirmation: saved, activated: false };
    return NextResponse.json({ confirmation: decodeConfirmation(result.confirmation), activated: result.activated }, { status: 201 });
  } catch (error) { return confirmationResponseError(error); }
}
