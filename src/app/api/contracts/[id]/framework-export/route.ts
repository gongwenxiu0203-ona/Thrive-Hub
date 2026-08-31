import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { authorizeConfirmation, confirmationResponseError, decodeConfirmation } from "@/lib/contractConfirmationStore";
import { parseEffectiveConfirmation } from "@/lib/contractConfirmationDraft";
import { fillFrameworkDocument } from "@/lib/frameworkDocument";
import { resolveContractFilePath } from "@/lib/contractFileStorage";
import { PARTY_B_COMPANIES, type PartyBCompanyKey } from "@/lib/partyB";
import { AppError } from "@/lib/appError";
import { frameworkMissingFields } from "@/lib/frameworkCompleteness";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorizeConfirmation(id, "READ");
    const selection = request.nextUrl.searchParams.get("selection") || "both";
    if (!["master", "confirmation", "both"].includes(selection)) throw new AppError("导出范围无效", 400);
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id }, include: { template: true, receivingAccounts: { orderBy: { position: "asc" } } } });
    if (contract.contractMode !== "FRAMEWORK") throw new AppError("历史合同请使用原导出入口", 400);
    if (!contract.template || contract.template.documentType !== "FRAMEWORK_MASTER") throw new AppError("主合同尚未选择主格式合同模板", 400);
    const missing = frameworkMissingFields(contract, contract.receivingAccounts.length);
    if (missing.length) throw new AppError(`请补齐主合同资料后导出：${missing.join("、")}`, 400);
    const partyB = PARTY_B_COMPANIES[contract.partyBCompany as PartyBCompanyKey];
    if (!contract.partyA || !partyB || !contract.partyAContact || !contract.partyAEmail || !contract.receivingAccounts.length) throw new AppError("请补齐主合同甲方名称、联系人、邮箱、乙方主体及收款账户后导出", 400);
    const confirmationId = request.nextUrl.searchParams.get("confirmationId");
    const row = selection !== "master" && confirmationId ? await prisma.contractProjectConfirmation.findFirst({ where: { id: confirmationId, contractId: id } }) : null;
    if (selection !== "master" && !row) throw new AppError("请选择当前主合同下的项目确认书", 400);
    const confirmation = row ? { number: row.number, draft: parseEffectiveConfirmation(decodeConfirmation(row).draft) } : undefined;
    const templatePath = await resolveContractFilePath(contract.template.fileUrl, ["contract-templates"]);
    if (!templatePath) throw new AppError("合同模板文件不存在", 404);
    const accounts = contract.receivingAccounts.map(a => JSON.parse(a.snapshot));
    let bytes: Buffer;
    try {
      bytes = await fillFrameworkDocument(await readFile(templatePath), {
        contractNo: contract.contractNo, partyA: contract.partyA, partyACreditCode: contract.partyACreditCode || "", partyAAddress: contract.partyAAddress || "",
        partyAContact: contract.partyAContact, partyAEmail: contract.partyAEmail, partyAPhone: contract.partyAPhone || "",
        partyB: partyB.name, partyBCreditCode: contract.partyBCreditCode || partyB.creditCode, partyBAddress: contract.partyBAddress || partyB.address,
        partyBContact: contract.partyBContact || "", partyBEmail: contract.partyBEmail || "", partyBPhone: contract.partyBPhone || "", accounts,
      }, selection as "master" | "confirmation" | "both", confirmation);
    } catch (error) { throw new AppError(error instanceof Error ? error.message : "模板填充失败", 400); }
    const filename = `${contract.contractNo}-${selection}${row ? `-${row.number}` : ""}.docx`;
    return new NextResponse(Uint8Array.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return confirmationResponseError(error); }
}
