import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/appError";
import { adminHasFeature } from "@/lib/session";
import { authorizeConfirmation, confirmationResponseError, decodeConfirmation, saveConfirmationDraft } from "@/lib/contractConfirmationStore";

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
    const [rows, bankAccounts, options, canEdit, canManage, users] = await Promise.all([
      prisma.contractProjectConfirmation.findMany({ where: { contractId: id }, orderBy: { createdAt: "asc" }, include: { versions: { orderBy: { version: "desc" }, select: { version: true, actorId: true, reason: true, createdAt: true } } } }),
      prisma.financeAccountProfile.findMany({ where: { id: { in: accountIds }, accountType: { in: ["COMPANY_PAYER", "COMPANY_BANK"] }, status: "ACTIVE" }, select: { id: true, name: true, accountName: true, accountNumber: true, legalEntity: true, bankName: true, swiftCode: true, bankAddress: true, currency: true }, orderBy: { name: "asc" } }),
      prisma.contractCustomOption.findMany({ select: { category: true, value: true }, orderBy: { value: "asc" } }),
      adminHasFeature(session, "contracts.records", "EDIT"), adminHasFeature(session, "contracts.records", "MANAGE"),
      prisma.user.findMany({ where: { role: { in: ["ADMIN", "USER"] }, status: "APPROVED" }, select: { id: true, name: true, email: true, phone: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ contract, confirmations: rows.map(decodeConfirmation), bankAccounts, options, canEdit, canManage, users, canRenumber: session.role === "ADMIN" && canManage }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return confirmationResponseError(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const { session } = await authorizeConfirmation(id, "EDIT");
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("请求格式错误", 400);
    return NextResponse.json({ confirmation: await saveConfirmationDraft(id, session.userId, body.draft) }, { status: 201 });
  } catch (error) { return confirmationResponseError(error); }
}
