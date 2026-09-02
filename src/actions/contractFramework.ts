"use server";

import { Prisma } from "@prisma/client";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { creationReferenceCustomerScope, isStaff } from "@/lib/dataScope";
import { PARTY_B_COMPANIES, type PartyBCompanyKey } from "@/lib/partyB";
import { saveUploadedFile } from "@/lib/upload";
import { authorizeConfirmation, decodeConfirmation } from "@/lib/contractConfirmationStore";
import { frameworkMissingFields } from "@/lib/frameworkCompleteness";
import { bumpCustomerStatus } from "@/lib/customer";

type Result = { ok: true; id: string } | { ok: false; error: string };
const allowedExtensions = new Set([".pdf", ".doc", ".docx"]);

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function snapshotAccount(account: {
  id: string; name: string; legalEntity: string; accountName: string;
  accountNumber: string; bankName: string | null; swiftCode: string | null;
  bankAddress: string | null; routingNumber: string | null; payeeAddress: string | null; currency: string;
}) {
  return JSON.stringify({ schemaVersion: 1, profileId: account.id, ...account });
}

export async function createFrameworkContract(form: FormData): Promise<Result> {
  let uploadedUrl: string | null = null;
  let persisted = false;
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "contracts.create_upload", "EDIT");
    if (!isStaff(session.role)) return { ok: false, error: "仅内部员工可以创建主格式合同" };
    const customerId = text(form, "customerId");
    const ownerId = text(form, "ownerId") || session.userId;
    const reviewerId = text(form, "reviewerId");
    const partyBCompany = text(form, "partyBCompany") as PartyBCompanyKey;
    const partyA = text(form, "partyA");
    const partyB = Object.hasOwn(PARTY_B_COMPANIES, partyBCompany) ? PARTY_B_COMPANIES[partyBCompany] : null;
    const accountIds = Array.from(new Set(form.getAll("receivingAccountIds").map(String).map((v) => v.trim()).filter(Boolean)));
    const file = form.get("file");
    const createFromTemplate = text(form, "flow") === "create";
    const templateId = text(form, "templateId");
    const template = templateId ? await prisma.contractTemplate.findFirst({ where: { id: templateId, documentType: "FRAMEWORK_MASTER", deletedAt: null }, select: { id: true } }) : null;
    if (createFromTemplate && !template) return { ok: false, error: "请先上传并选择主格式合同模板" };
    const missingBasics = [
      !customerId ? "关联客户" : null,
      !partyA ? "甲方公司名称/发票抬头" : null,
      !partyB ? "乙方签约主体" : null,
      !accountIds.length ? "乙方收款账户" : null,
    ].filter((value): value is string => Boolean(value));
    if (missingBasics.length) {
      return { ok: false, error: `以下必填信息未随表单提交：${missingBasics.join("、")}。请核对后重试` };
    }
    // The combined diagnostic above also guarantees this branch; keep the
    // explicit guard so TypeScript narrows the selected company below.
    if (!partyB) return { ok: false, error: "请选择有效乙方签约主体" };
    if (!createFromTemplate) {
      const masterFields = Object.fromEntries(["partyA", "partyACreditCode", "partyAAddress", "partyAContact", "partyAEmail", "partyAPhone", "partyBCompany", "partyBContact", "partyBEmail", "partyBPhone"].map(key => [key, text(form, key)]));
      const missing = frameworkMissingFields(masterFields, accountIds.length);
      if (missing.length) return { ok: false, error: `上传已有合同需补齐资料后完成签署：${missing.join("、")}` };
      if (form.get("signedConfirmed") !== "true") return { ok: false, error: "请确认上传原件已由双方签字/盖章" };
    }
    if (!createFromTemplate && (!(file instanceof File) || !file.size || file.size > 20 * 1024 * 1024 || !allowedExtensions.has(path.extname(file.name).toLowerCase()))) {
      return { ok: false, error: "请上传20MB以内的PDF或Word主格式合同原件" };
    }
    const magic = file instanceof File ? new Uint8Array(await file.slice(0, 8).arrayBuffer()) : new Uint8Array();
    const ext = file instanceof File ? path.extname(file.name).toLowerCase() : ".docx";
    const valid = ext === ".pdf"
      ? new TextDecoder().decode(magic).startsWith("%PDF-")
      : ext === ".docx"
        ? magic[0] === 0x50 && magic[1] === 0x4b
        : [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => magic[i] === v);
    if (!createFromTemplate && !valid) return { ok: false, error: "文件内容与扩展名不匹配" };
    const [customer, owner, reviewer, accounts] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, deletedAt: null, ...creationReferenceCustomerScope(session) }, select: { id: true } }),
      prisma.user.findFirst({ where: { id: ownerId, status: "APPROVED", role: { in: ["ADMIN", "USER"] } }, select: { id: true } }),
      reviewerId ? prisma.user.findFirst({ where: { id: reviewerId, status: "APPROVED", role: { in: ["ADMIN", "USER"] } }, select: { id: true } }) : Promise.resolve(null),
      prisma.financeAccountProfile.findMany({ where: { id: { in: accountIds }, accountType: { in: ["COMPANY_PAYER", "COMPANY_BANK"] }, status: "ACTIVE" }, select: { id: true, name: true, legalEntity: true, accountName: true, accountNumber: true, bankName: true, swiftCode: true, bankAddress: true, routingNumber: true, payeeAddress: true, currency: true } }),
    ]);
    if (!customer) return { ok: false, error: "客户不存在或不在可选范围" };
    if (!owner) return { ok: false, error: "合同负责人不是有效内部用户" };
    if (createFromTemplate && !reviewer) return { ok: false, error: "请选择有效的内部审核人" };
    if (accounts.length !== accountIds.length) return { ok: false, error: "部分收款账户已停用或不是公司账户，请重新选择" };
    const saved = createFromTemplate ? { fileUrl: null } : await saveUploadedFile(file as File);
    uploadedUrl = saved.fileUrl;
    let lastConflict: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(new Date());
          const prefix = `THRAIVE-${year}-`;
          const existing = await tx.contract.findMany({ where: { contractNo: { startsWith: prefix }, deletedAt: null }, select: { contractNo: true } });
          const max = existing.reduce((value, row) => Math.max(value, Number.parseInt(row.contractNo.slice(prefix.length), 10) || 0), 0);
          const contractNo = `${prefix}${String(max + 1).padStart(3, "0")}`;
          const contract = await tx.contract.create({ data: {
            contractNo, contractMode: "FRAMEWORK", customerId, type: "BRAND", status: createFromTemplate ? "DRAFT" : "COMPLETED",
            ownerId, reviewerId: reviewer?.id ?? null, createdById: session.userId, fileUrl: saved.fileUrl, templateId: template?.id ?? null, uploadType: createFromTemplate ? "WEBSITE_CREATE" : "EXISTING",
            uploadArchiveMode: createFromTemplate ? null : "SIGNED_ARCHIVE", extractedBy: "MANUAL",
            partyA, partyACreditCode: text(form, "partyACreditCode") || null,
            partyAAddress: text(form, "partyAAddress") || null, partyAContact: text(form, "partyAContact") || null,
            partyAPhone: text(form, "partyAPhone") || null, partyAEmail: text(form, "partyAEmail") || null,
            partyBCompany, partyBCreditCode: partyB.creditCode, partyBLegalRep: partyB.legalRep,
            partyBAddress: partyB.address, partyBContact: text(form, "partyBContact") || partyB.contact, partyBPhone: text(form, "partyBPhone") || partyB.phone,
            partyBEmail: text(form, "partyBEmail") || partyB.email, partyBBankAccounts: "[]", remark: text(form, "remark") || null,
            ...(saved.fileUrl ? { versions: { create: { versionNo: 1, fileUrl: saved.fileUrl, fileType: ext.slice(1), reason: "主格式合同签署原件归档", createdById: session.userId } } } : {}),
            receivingAccounts: { create: accounts.map((account, position) => ({ financeProfileId: account.id, snapshot: snapshotAccount(account), position })) },
          }, select: { id: true } });
          await tx.financeAuditLog.create({ data: { entityType: "CONTRACT", entityId: contract.id, action: "CREATE_FRAMEWORK", fromStatus: null, toStatus: createFromTemplate ? "DRAFT" : "COMPLETED", actorId: session.userId, note: createFromTemplate ? "网站创建品牌方合同" : "上传已有品牌方合同并直接归档为签署完成", metadata: JSON.stringify({ reviewerId: reviewer?.id ?? null, flow: createFromTemplate ? "create" : "upload" }) } });
          return contract;
        });
        persisted = true;
        if (!createFromTemplate) await bumpCustomerStatus(customerId, "COOPERATING");
        revalidatePath("/contracts");
        return { ok: true, id: created.id };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { lastConflict = error; continue; }
        throw error;
      }
    }
    console.warn("[create-framework-contract] number conflict", lastConflict);
    throw new Error("合同编号并发冲突，请重新提交");
  } catch (error) {
    if (uploadedUrl && !persisted) await unlink(path.join(process.cwd(), "uploads", path.basename(uploadedUrl))).catch(() => undefined);
    return { ok: false, error: error instanceof Error ? error.message : "创建主格式合同失败" };
  }
}

/** Edit master metadata only; SOW rules and signed/version files are never rewritten. */
export async function updateFrameworkContract(form: FormData): Promise<Result> {
  try {
    const id = text(form, "contractId");
    const { session, contract } = await authorizeConfirmation(id, "EDIT");
    await requireFeaturePermission(session, "contracts.create_upload", "EDIT");
    if (contract.contractMode !== "FRAMEWORK") return { ok: false, error: "历史合同请使用原字段编辑入口" };
    if (contract.status === "COMPLETED" && session.role !== "ADMIN") return { ok: false, error: "合同签署完成后仅管理员可以修改" };
    const reason = text(form, "changeReason");
    if (!reason || reason.length > 2000) return { ok: false, error: "请填写修改原因（最多2000字）" };
    const updatedAt = new Date(text(form, "expectedUpdatedAt"));
    if (!Number.isFinite(updatedAt.getTime())) return { ok: false, error: "版本信息无效，请刷新页面" };
    const partyBCompany = text(form, "partyBCompany") as PartyBCompanyKey;
    if (!Object.hasOwn(PARTY_B_COMPANIES, partyBCompany)) return { ok: false, error: "请选择有效乙方主体" };
    const partyB = PARTY_B_COMPANIES[partyBCompany];
    const accountIds = [...new Set(form.getAll("receivingAccountIds").map(String).map(v => v.trim()).filter(Boolean))];
    if (!text(form, "partyA") || !accountIds.length || accountIds.length > 20) return { ok: false, error: "请填写甲方并选择1至20个收款账户" };
    await prisma.$transaction(async tx => {
      const current = await tx.contract.findFirst({ where: { id, deletedAt: null, updatedAt, status: contract.status, contractMode: "FRAMEWORK" }, include: { receivingAccounts: true, projectConfirmations: true } });
      if (!current) throw new Error("合同已被修改，请刷新后重试");
      const owner = await tx.user.findFirst({ where: { id: text(form, "ownerId"), status: "APPROVED", role: { in: ["ADMIN", "USER"] } }, select: { id: true } });
      if (!owner) throw new Error("请选择有效内部负责人");
      const reviewer = await tx.user.findFirst({ where: { id: text(form, "reviewerId"), status: "APPROVED", role: { in: ["ADMIN", "USER"] } }, select: { id: true } });
      if (!reviewer) throw new Error("请选择有效内部审核人");
      const accounts = await tx.financeAccountProfile.findMany({ where: { id: { in: accountIds }, status: "ACTIVE", accountType: { in: ["COMPANY_PAYER", "COMPANY_BANK"] } } });
      const retainedIds = new Set(current.receivingAccounts.flatMap(row => row.financeProfileId ? [row.financeProfileId] : []));
      const activeIds = new Set(accounts.map(account => account.id));
      if (accountIds.some(accountId => !activeIds.has(accountId) && !retainedIds.has(accountId))) throw new Error("新增收款账户必须是启用的公司账户，请重新选择");
      const inUse = new Set(current.projectConfirmations.flatMap(row => decodeConfirmation(row).draft.receivingAccountIds));
      if ([...inUse].some(accountId => !accountIds.includes(accountId))) throw new Error("不能移除项目确认书已引用的收款账户；请保留该账户，避免破坏历史关联");
      if (current.projectConfirmations.some(row => row.status !== "DRAFT") && (partyBCompany !== current.partyBCompany || text(form, "partyA") !== current.partyA)) throw new Error("已有生效确认书，不能直接改换甲乙方签约主体");
      const templateId = text(form, "templateId");
      if (templateId && !await tx.contractTemplate.findFirst({ where: { id: templateId, documentType: "FRAMEWORK_MASTER", deletedAt: null }, select: { id: true } })) throw new Error("所选主格式合同模板无效");
      const fields = {
        ownerId: owner.id, reviewerId: reviewer.id, templateId: templateId || null, partyA: text(form, "partyA"),
        partyACreditCode: text(form, "partyACreditCode") || null, partyAAddress: text(form, "partyAAddress") || null,
        partyAContact: text(form, "partyAContact") || null, partyAEmail: text(form, "partyAEmail") || null, partyAPhone: text(form, "partyAPhone") || null,
        partyBCompany, partyBCreditCode: partyB.creditCode, partyBLegalRep: partyB.legalRep, partyBAddress: partyB.address,
        partyBContact: text(form, "partyBContact") || null, partyBEmail: text(form, "partyBEmail") || null, partyBPhone: text(form, "partyBPhone") || null,
        remark: text(form, "remark") || null,
      };
      const changed = await tx.contract.updateMany({ where: { id, updatedAt, status: current.status, deletedAt: null }, data: fields });
      if (changed.count !== 1) throw new Error("合同已被修改，请刷新后重试");
      if (current.status === "REVIEWING" && current.reviewerId !== reviewer.id) {
        await tx.contractReview.updateMany({ where: { contractId: id, status: "PENDING" }, data: { reviewerId: reviewer.id } });
      }
      // Existing selected accounts keep their original snapshot; only new selections take a new snapshot.
      // Detached historical snapshots remain archived even if their finance profile no longer exists.
      const removed = current.receivingAccounts.filter(row => row.financeProfileId && !accountIds.includes(row.financeProfileId));
      if (removed.length) await tx.contractReceivingAccount.deleteMany({ where: { contractId: id, id: { in: removed.map(row => row.id) } } });
      for (const [position, accountId] of accountIds.entries()) {
        const existing = current.receivingAccounts.find(row => row.financeProfileId === accountId);
        if (existing) await tx.contractReceivingAccount.update({ where: { id: existing.id }, data: { position } });
        else {
          const account = accounts.find(item => item.id === accountId)!;
          await tx.contractReceivingAccount.create({ data: { contractId: id, financeProfileId: account.id, snapshot: snapshotAccount(account), position } });
        }
      }
      await tx.financeAuditLog.create({ data: { entityType: "CONTRACT", entityId: id, action: "UPDATE_FRAMEWORK", fromStatus: current.status, toStatus: current.status, actorId: session.userId, note: reason, metadata: JSON.stringify({ before: Object.fromEntries(Object.keys(fields).map(key => [key, current[key as keyof typeof current]])), after: fields, previousAccounts: current.receivingAccounts, selectedAccountIds: accountIds }) } });
    });
    revalidatePath("/contracts"); revalidatePath(`/contracts/${id}`); revalidatePath(`/contracts/${id}/confirmations`);
    return { ok: true, id };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "保存主合同失败" }; }
}
