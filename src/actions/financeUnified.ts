"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { createTwoStageFinanceApproval, normalizeFinanceUrls, requireShallowFinanceReviewer } from "@/lib/financeApproval";

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const refNo = (prefix: string) => `${prefix}-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
const cleanCurrency = (value: string) => value.trim().toUpperCase();
const cleanText = (value: string) => value.trim().replace(/\s+/g, " ");
const billingDescription: Record<ManualBillingItemInput["feeType"], string> = {
  MONTHLY_FEE: "月度服务费",
  SALES_COMMISSION: "销售佣金",
  AFFILIATE_FEE: "联盟商费用",
  SINGLE_CHANNEL_FEE: "单渠道费用",
};

export type ManualBillingItemInput = {
  description: string;
  feeType: "MONTHLY_FEE" | "SALES_COMMISSION" | "AFFILIATE_FEE" | "SINGLE_CHANNEL_FEE";
  currency: string;
  periodType: "MONTH" | "DATE_RANGE";
  periodLabel: string;
  promoPlatform?: string;
  targetSite?: string;
  affiliatePlatform?: string;
  quantity: number;
  unitPrice: number;
  remark?: string;
  serviceMonths?: string[];
  netAmount?: number;
  taxRate?: number;
};

export async function submitManualBillingRequest(input: {
  customerId: string;
  contractId?: string;
  documentType: "INVOICE" | "DOMESTIC";
  note?: string;
  items: ManualBillingItemInput[];
}) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.billing_requests", "EDIT");
    if (!isStaff(session.role)) return { ok: false, error: "仅内部员工可以提交开票申请。" };
    if (!input.customerId || !["INVOICE", "DOMESTIC"].includes(input.documentType)) return { ok: false, error: "请选择客户和票据类型。" };
    if (!input.items.length || input.items.length > 50) return { ok: false, error: "请填写 1 至 50 条开票明细。" };
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null }, select: { id: true, brandName: true } });
    if (!customer) return { ok: false, error: "客户不存在。" };
    if (input.contractId) {
      const contract = await prisma.contract.findFirst({ where: { id: input.contractId, customerId: input.customerId }, select: { id: true } });
      if (!contract) return { ok: false, error: "合同不属于所选客户。" };
    }
    const normalized = input.items.map((item, sortOrder) => {
      if (!["MONTHLY_FEE", "SALES_COMMISSION", "AFFILIATE_FEE", "SINGLE_CHANNEL_FEE"].includes(item.feeType)) throw new Error("请选择费用类型。");
      const quantity = Number(item.quantity); const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("数量和单价必须大于 0。");
      const serviceMonths = [...new Set((item.serviceMonths ?? []).map((month) => month.trim()))];
      if (serviceMonths.some((month) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) throw new Error("服务月份格式必须为 YYYY-MM。");
      let netAmount: number | null = null, taxRate: number | null = null, taxAmount: number | null = null, grossAmount: number | null = null;
      if (input.documentType === "DOMESTIC") {
        netAmount = round(Number(item.netAmount)); taxRate = Number(item.taxRate);
        if (!serviceMonths.length || !Number.isFinite(netAmount) || netAmount <= 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) throw new Error("国内发票每行必须填写服务月份、正数未税额和 0 至 1 的税率。");
        taxAmount = round(netAmount * taxRate); grossAmount = round(netAmount + taxAmount);
      }
      return { ...item, description: billingDescription[item.feeType], currency: cleanCurrency(item.currency || "USD"), quantity, unitPrice: round(unitPrice), amount: grossAmount ?? round(quantity * unitPrice), serviceMonths: JSON.stringify(serviceMonths), netAmount, taxRate, taxAmount, grossAmount, sortOrder };
    });
    const currencies = new Set(normalized.map((item) => item.currency));
    if (currencies.size !== 1) return { ok: false, error: "一张普通开票申请的明细币种必须一致。" };
    const requestedAmount = round(normalized.reduce((sum, item) => sum + item.amount, 0));
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.billingRequest.create({ data: {
        requestNo: refNo("BR"), applicantId: session.userId, customerId: customer.id,
        contractId: input.contractId || null, legalEntityKey: customer.brandName,
        documentType: input.documentType, mergeMode: "MERGED", currency: normalized[0].currency,
        requestedAmount, sourceType: "MANUAL", applicantNote: input.note?.trim() || null,
        manualItems: { create: normalized.map((item) => ({ description: item.description, feeType: item.feeType, currency: item.currency, periodType: item.periodType, periodLabel: item.periodLabel.trim(), promoPlatform: item.promoPlatform?.trim() || null, targetSite: item.targetSite?.trim() || null, affiliatePlatform: item.affiliatePlatform?.trim() || null, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.amount, serviceMonths: item.serviceMonths, netAmount: item.netAmount, taxRate: item.taxRate, taxAmount: item.taxAmount, grossAmount: item.grossAmount, remark: item.remark?.trim() || null, sortOrder: item.sortOrder })) }
      }, select: { id: true, requestNo: true } });
      await createTwoStageFinanceApproval(tx, "BILLING_REQUEST", created.id);
      return created;
    });
    revalidatePath("/finance/workbench");
    return { ok: true, request };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "提交开票申请失败。" }; }
}

export async function saveCustomerBillingProfile(input: { customerId: string; name: string; invoiceTitle: string; taxNumber?: string; registeredAddress?: string; registeredPhone?: string; bankName?: string; bankAccount?: string; deliveryEmail?: string; isDefault?: boolean }) {
  try {
    const session = await requireSession(); await requireFeaturePermission(session, "finance.profiles", "EDIT");
    if (!input.name.trim() || !input.invoiceTitle.trim()) return { ok: false, error: "资料名称和发票抬头必填。" };
    const result = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.customerBillingProfile.updateMany({ where: { customerId: input.customerId }, data: { isDefault: false } });
      const data = { name: cleanText(input.name), invoiceTitle: cleanText(input.invoiceTitle), taxNumber: input.taxNumber?.replace(/\s+/g, "").toUpperCase() || null, registeredAddress: input.registeredAddress ? cleanText(input.registeredAddress) : null, registeredPhone: input.registeredPhone?.replace(/\s+/g, "") || null, bankName: input.bankName ? cleanText(input.bankName) : null, bankAccount: input.bankAccount?.replace(/\s+/g, "") || null, deliveryEmail: input.deliveryEmail?.trim().toLowerCase() || null, isDefault: !!input.isDefault };
      const duplicate = await tx.customerBillingProfile.findFirst({ where: { customerId: input.customerId, invoiceTitle: data.invoiceTitle, taxNumber: data.taxNumber, status: "ACTIVE" }, select: { id: true } });
      return duplicate ? tx.customerBillingProfile.update({ where: { id: duplicate.id }, data }) : tx.customerBillingProfile.create({ data: { customerId: input.customerId, ...data } });
    });
    revalidatePath("/finance/workbench"); return { ok: true, id: result.id };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "保存开票资料失败。" }; }
}

export async function saveFinanceAccountProfile(input: { id?: string; name: string; accountType: string; legalEntity: string; accountName: string; bankName?: string; accountNumber: string; currency?: string; country?: string; swiftCode?: string; bankAddress?: string; payeeAddress?: string; routingNumber?: string; note?: string; payerAccountKey?: string; attachmentUrls?: string[]; isDefault?: boolean }) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(session, "finance.profiles", "MANAGE");
    const accountNumber = input.accountNumber.replace(/\s+/g, "");
    const legalEntity = cleanText(input.legalEntity);
    const currency = cleanCurrency(input.currency || (["CUSTOMER_BILLING", "COMPANY_PAYER", "SUPPLIER_PAYEE", "EMPLOYEE_REIMBURSEMENT"].includes(input.accountType) ? "CNY" : "USD"));
    if (!input.name.trim() || !legalEntity || !input.accountName.trim() || !accountNumber || !currency) return { ok: false, error: "请完整填写账户名称、主体、户名、账号和币种。" };
    const saved = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.financeAccountProfile.findFirst({ where: { legalEntity, accountNumber, currency, status: "ACTIVE", ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } });
      if (duplicate) throw new Error("相同付款主体、账号和币种的财务账户已存在，请勿重复创建。");
      if (input.isDefault) await tx.financeAccountProfile.updateMany({ where: { legalEntity, currency, status: "ACTIVE" }, data: { isDefault: false } });
      const data = { name: cleanText(input.name), accountType: input.accountType || "COMPANY_BANK", legalEntity, accountName: cleanText(input.accountName), bankName: input.bankName ? cleanText(input.bankName) : null, accountNumber, currency, country: input.country?.trim().toUpperCase() || null, swiftCode: input.swiftCode?.replace(/\s+/g, "").toUpperCase() || null, bankAddress: input.bankAddress ? cleanText(input.bankAddress) : null, payeeAddress: input.payeeAddress ? cleanText(input.payeeAddress) : null, routingNumber: input.routingNumber?.trim() || null, note: input.note?.trim() || null, payerAccountKey: input.payerAccountKey?.trim() || null, attachmentUrls: JSON.stringify(normalizeFinanceUrls(input.attachmentUrls)), isDefault: !!input.isDefault };
      return input.id ? tx.financeAccountProfile.update({ where: { id: input.id }, data }) : tx.financeAccountProfile.create({ data: { ...data, profileNo: refNo("ACC"), createdById: session.userId } });
    });
    revalidatePath("/finance/workbench"); return { ok: true, id: saved.id };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "保存财务账户失败。" }; }
}

export async function createSupplierAndPaymentRequest(input: { supplierName: string; supplierType: string; country?: string; accountName: string; bankName?: string; accountNumber: string; swiftCode?: string; payerEntity?: string; payerAccountKey?: string; payerAccountProfileId?: string; reason: string; currency: string; amount: number; scheduledAt?: string; relatedInvoiceId?: string; relatedReceiptId?: string; invoiceUrls?: string | string[]; attachmentUrls?: string[]; note?: string }) {
  try {
    const session = await requireSession(); await requireFeaturePermission(session, "finance.payment_requests", "EDIT");
    const amount = round(Number(input.amount)); if (!input.supplierName.trim() || !input.accountName.trim() || !input.accountNumber.trim() || !input.reason.trim() || amount <= 0) return { ok: false, error: "请完整填写供应商、收款账户、付款事由和金额。" };
    if (!input.payerAccountProfileId) return { ok: false, error: "付款主体和付款账户必须从统一财务账户目录选择。" };
    const result = await prisma.$transaction(async (tx) => {
      const payer = await tx.financeAccountProfile.findFirst({ where: { id: input.payerAccountProfileId, status: "ACTIVE" } });
      if (!payer) throw new Error("所选付款主体或账户不存在、已停用，请重新选择。");
      const requestType = (input.supplierType || "SUPPLIER").toUpperCase();
      if (["CHANNEL", "AFFILIATE"].includes(requestType)) {
        if (!input.relatedInvoiceId || !input.relatedReceiptId) throw new Error("渠道或联盟付款必须关联已开票票据和客户到账记录。");
        const issuedInvoice = await tx.invoice.findFirst({ where: { id: input.relatedInvoiceId, status: "ISSUED", deletedAt: null }, select: { id: true, accountsReceivableId: true, customerId: true } });
        if (!issuedInvoice) throw new Error("关联票据不存在或尚未开票。");
        const receipt = await tx.customerReceipt.findFirst({ where: { id: input.relatedReceiptId, customerId: issuedInvoice.customerId ?? undefined, status: { not: "REVERSED" }, allocations: { some: { status: "ACTIVE", allocatedAmount: { gt: 0 }, OR: [{ invoiceId: issuedInvoice.id }, { accountsReceivableId: issuedInvoice.accountsReceivableId ?? "__none__" }] } } }, select: { id: true } });
        if (!receipt) throw new Error("关联客户到账记录尚未有效核销到该票据，不能提交渠道或联盟付款。");
      }
      const supplierName = cleanText(input.supplierName);
      let supplier = await tx.supplier.findFirst({ where: { name: supplierName, type: requestType, status: "ACTIVE" }, select: { id: true } });
      if (!supplier) supplier = await tx.supplier.create({ data: { supplierNo: refNo("SUP"), name: supplierName, type: requestType, country: input.country?.trim().toUpperCase() || null, bankAccounts: { create: { accountName: cleanText(input.accountName), bankName: input.bankName ? cleanText(input.bankName) : null, accountNumber: input.accountNumber.replace(/\s+/g, ""), country: input.country?.trim().toUpperCase() || null, currency: cleanCurrency(input.currency), swiftCode: input.swiftCode?.replace(/\s+/g, "").toUpperCase() || null, isDefault: true } } }, select: { id: true } });
      const created = await tx.paymentRequest.create({ data: { requestNo: refNo("PAY"), applicantId: session.userId, supplierId: supplier.id, requestType, payerEntity: payer.legalEntity, payerAccountKey: payer.payerAccountKey ?? payer.id, payeeSnapshot: JSON.stringify({ accountName: cleanText(input.accountName), bankName: input.bankName ? cleanText(input.bankName) : null, accountNumber: input.accountNumber.replace(/\s+/g, ""), swiftCode: input.swiftCode?.replace(/\s+/g, "").toUpperCase() || null, payerProfileId: payer.id, payerAccountName: payer.accountName, payerAccountNumber: payer.accountNumber }), reason: cleanText(input.reason), currency: cleanCurrency(input.currency), amount, scheduledAt: input.scheduledAt ? new Date(`${input.scheduledAt}T00:00:00`) : null, relatedInvoiceId: input.relatedInvoiceId || null, relatedReceiptId: input.relatedReceiptId || null, note: input.note?.trim() || null, items: { create: { description: cleanText(input.reason), amount, currency: cleanCurrency(input.currency), invoiceUrls: JSON.stringify(normalizeFinanceUrls(input.invoiceUrls)) } } }, select: { id: true } });
      await createTwoStageFinanceApproval(tx, "PAYMENT_REQUEST", created.id);
      const attachments = normalizeFinanceUrls(input.attachmentUrls);
      if (attachments.length) await tx.financeAttachment.createMany({ data: attachments.map((fileUrl, index) => ({ entityType: "PAYMENT_REQUEST", entityId: created.id, attachmentType: "SUPPORTING_DOCUMENT", fileUrl, uploadedById: session.userId, version: index + 1 })) });
      return created;
    });
    revalidatePath("/finance/workbench"); return { ok: true, id: result.id };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "提交付款申请失败。" }; }
}

export async function createExpenseClaim(input: { reimbursementEntity: string; currency: string; accountName: string; accountNumber: string; note?: string; attachmentUrls?: string[]; items: Array<{ description: string; expenseType: string; expenseDate: string; amount: number; invoiceTitle?: string; invoiceNumber?: string; invoiceUrls?: string | string[]; remark?: string }> }) {
  try {
    const session = await requireSession(); await requireFeaturePermission(session, "finance.expenses", "EDIT");
    if (!input.reimbursementEntity.trim() || !input.accountName.trim() || !input.accountNumber.trim() || !input.items.length) return { ok: false, error: "请完整填写报销主体、收款账户和费用明细。" };
    const items = input.items.map((item, sortOrder) => { const amount = round(Number(item.amount)); if (!item.description.trim() || !item.expenseType || !item.expenseDate || amount <= 0) throw new Error("请完整填写每条费用明细。"); return { ...item, amount, sortOrder }; });
    const totalAmount = round(items.reduce((sum, item) => sum + item.amount, 0));
    const claim = await prisma.$transaction(async (tx) => {
      const created = await tx.expenseClaim.create({ data: { claimNo: refNo("EXP"), employeeId: session.userId, reimbursementEntity: cleanText(input.reimbursementEntity), currency: cleanCurrency(input.currency), totalAmount, payeeSnapshot: JSON.stringify({ accountName: cleanText(input.accountName), accountNumber: input.accountNumber.replace(/\s+/g, "") }), note: input.note?.trim() || null, items: { create: items.map((item) => ({ description: cleanText(item.description), expenseType: item.expenseType, expenseDate: new Date(`${item.expenseDate}T00:00:00`), currency: cleanCurrency(input.currency), amount: item.amount, invoiceTitle: item.invoiceTitle ? cleanText(item.invoiceTitle) : null, invoiceNumber: item.invoiceNumber?.replace(/\s+/g, "").toUpperCase() || null, invoiceUrls: JSON.stringify(normalizeFinanceUrls(item.invoiceUrls)), remark: item.remark?.trim() || null, sortOrder: item.sortOrder })) } }, select: { id: true } });
      await createTwoStageFinanceApproval(tx, "EXPENSE_CLAIM", created.id);
      const attachments = normalizeFinanceUrls(input.attachmentUrls);
      if (attachments.length) await tx.financeAttachment.createMany({ data: attachments.map((fileUrl, index) => ({ entityType: "EXPENSE_CLAIM", entityId: created.id, attachmentType: "SUPPORTING_DOCUMENT", fileUrl, uploadedById: session.userId, version: index + 1 })) });
      return created;
    });
    revalidatePath("/finance/workbench"); return { ok: true, id: claim.id };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "提交报销失败。" }; }
}

export async function decideFinanceRequest(entityType: "BILLING_REQUEST" | "PAYMENT_REQUEST" | "EXPENSE_CLAIM", id: string, action: "APPROVE" | "REJECT" | "PAID", details?: string | { comment?: string; proofUrls?: string[]; transactionNo?: string; paidAt?: string }) {
  try {
    const session = await requireSession();
    await requireFeaturePermission(
      session,
      entityType === "BILLING_REQUEST"
        ? "finance.billing_requests"
        : entityType === "EXPENSE_CLAIM"
          ? "finance.expenses"
          : action === "PAID"
            ? "finance.payments"
            : "finance.payment_requests",
      action === "PAID" ? "MANAGE" : "EDIT",
    );
    const comment = typeof details === "string" ? details.trim() : details?.comment?.trim() || "";
    if (action === "REJECT" && !comment) return { ok: false, error: "驳回必须填写原因。" };
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const shallow = await requireShallowFinanceReviewer(tx);
      const entity = entityType === "BILLING_REQUEST"
        ? await tx.billingRequest.findUnique({ where: { id }, select: { applicantId: true, status: true } })
        : entityType === "PAYMENT_REQUEST"
          ? await tx.paymentRequest.findUnique({ where: { id }, select: { applicantId: true, status: true } })
          : await tx.expenseClaim.findUnique({ where: { id }, select: { employeeId: true, status: true } }).then((row) => row ? ({ applicantId: row.employeeId, status: row.status }) : null);
      if (!entity) throw new Error("申请不存在。");
      if (entity.applicantId === session.userId) throw new Error("申请人不得审核或执行自己的申请；管理员也不例外。该拒绝已由服务器审计日志记录。");
      if (action === "REJECT" && ["APPROVED", "PROCESSING"].includes(entity.status)) {
        const returned = await tx.financeApprovalStep.updateMany({ where: { entityType, entityId: id, stepNo: 2, status: "PENDING" }, data: { status: "REJECTED", operatorId: session.userId, comment, actedAt: now } });
        if (returned.count !== 1) throw new Error("财务处理步骤已被处理，请刷新后重试。");
        const update = { status: "REJECTED", rejectionReason: comment };
        const changed = entityType === "BILLING_REQUEST"
          ? await tx.billingRequest.updateMany({ where: { id, status: "PROCESSING" }, data: update })
          : entityType === "PAYMENT_REQUEST"
            ? await tx.paymentRequest.updateMany({ where: { id, status: "APPROVED" }, data: update })
            : await tx.expenseClaim.updateMany({ where: { id, status: "APPROVED" }, data: update });
        if (changed.count !== 1) throw new Error("申请状态已变化，退回未写入。");
        return;
      }
      if (action === "APPROVE" || action === "REJECT") {
        if (entity.status !== "SUBMITTED") throw new Error("仅待初审申请可以审批，当前状态已变化，请刷新。");
        if (session.userId !== shallow.id) throw new Error(`仅 ${shallow.email} 可以执行初审。`);
        const step = await tx.financeApprovalStep.updateMany({ where: { entityType, entityId: id, stepNo: 1, assigneeId: session.userId, status: "PENDING" }, data: { status: action === "REJECT" ? "REJECTED" : "APPROVED", operatorId: session.userId, comment: comment || null, actedAt: now } });
        if (step.count !== 1) throw new Error("初审步骤已被处理，请勿重复提交。");
        const expected = { id, status: "SUBMITTED" };
        const update = action === "REJECT" ? { status: "REJECTED", rejectionReason: comment } : entityType === "BILLING_REQUEST" ? { status: "SUBMITTED" } : { status: "APPROVED", approvedById: session.userId, approvedAt: now };
        const changed = entityType === "BILLING_REQUEST" ? await tx.billingRequest.updateMany({ where: expected, data: update }) : entityType === "PAYMENT_REQUEST" ? await tx.paymentRequest.updateMany({ where: expected, data: update }) : await tx.expenseClaim.updateMany({ where: expected, data: update });
        if (changed.count !== 1) throw new Error("申请状态已变化，审批未写入。");
      } else {
        if (entityType === "BILLING_REQUEST") throw new Error("开票申请不能执行付款操作。");
        if (entity.status !== "APPROVED") throw new Error("仅 Shallow 初审通过的申请可以付款。");
        const proofUrls = normalizeFinanceUrls(typeof details === "string" ? details : details?.proofUrls);
        const transactionNo = typeof details === "string" ? "" : details?.transactionNo?.trim() || "";
        const paidAtText = typeof details === "string" ? "" : details?.paidAt?.trim() || "";
        if (!proofUrls.length || !transactionNo || !/^\d{4}-\d{2}-\d{2}$/.test(paidAtText)) throw new Error("付款必须填写付款日期、交易流水号并上传至少一份付款凭证。");
        const paidAt = new Date(`${paidAtText}T00:00:00.000Z`);
        const step = await tx.financeApprovalStep.updateMany({ where: { entityType, entityId: id, stepNo: 2, status: "PENDING" }, data: { status: "APPROVED", operatorId: session.userId, comment: comment || null, actedAt: now } });
        if (step.count !== 1) throw new Error("付款步骤已被处理，请勿重复提交。");
        const expected = { id, status: "APPROVED" };
        const changed = entityType === "PAYMENT_REQUEST" ? await tx.paymentRequest.updateMany({ where: expected, data: { status: "PAID", paidById: session.userId, paidAt, transactionNo, paymentProofUrls: JSON.stringify(proofUrls) } }) : await tx.expenseClaim.updateMany({ where: expected, data: { status: "PAID", paidAt, paymentProofUrls: JSON.stringify(proofUrls) } });
        if (changed.count !== 1) throw new Error("申请状态已变化，付款未写入。");
      }
    });
    revalidatePath("/finance/workbench"); return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "操作失败。" }; }
}
