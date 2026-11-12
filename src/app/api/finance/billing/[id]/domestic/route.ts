import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  FeaturePermissionError,
} from "@/lib/permissionGuard";
import { domesticInvoiceUploader } from "@/lib/domesticInvoiceUploadAccess";
import { domesticInvoiceForm, domesticInvoiceFile, DomesticUploadError } from "@/lib/domesticInvoiceUpload";
import { saveUploadedFile } from "@/lib/upload";
import { allocateDomesticAmounts } from "@/lib/domesticBilling";
import { resolveDomesticBillingDetails } from "@/lib/domesticBillingDetails";
import {recordFinanceEvent} from '@/lib/financeRequestHistory';

const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
function number(form: FormData, key: string) {
  const value = Number(form.get(key));
  if (!Number.isFinite(value)) throw new DomesticUploadError(`${key} 格式不正确。`);
  return round(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await domesticInvoiceUploader();
    const { id } = await params;
    const form = await domesticInvoiceForm(request);
    const file = await domesticInvoiceFile(form.get("file"));
    const invoiceNumber = String(form.get("invoiceNumber") ?? "").trim();
    const invoiceType = String(form.get("invoiceType") ?? "").trim();
    const invoiceCode = String(form.get("invoiceCode") ?? "").trim() || null;
    const dateText = String(form.get("invoiceDate") ?? "");
    if (!invoiceNumber || !invoiceType || !/^\d{4}-\d{2}-\d{2}$/.test(dateText))
      return NextResponse.json(
        { error: "请完整填写发票号码、类型和开票日期。" },
        { status: 400 },
      );
    const invoiceDate = new Date(`${dateText}T00:00:00.000Z`);
    if(Number.isNaN(invoiceDate.getTime())||invoiceDate.toISOString().slice(0,10)!==dateText||!['VAT_SPECIAL','VAT_ORDINARY','ELECTRONIC'].includes(invoiceType))return NextResponse.json({error:'发票日期或类型不正确。'},{status:400});
    const taxInclusiveAmount = number(form, "taxInclusiveAmount"),
      netAmount = number(form, "netAmount"),
      taxAmount = number(form, "taxAmount");
    const taxRateRaw = String(form.get("taxRate") ?? "").trim();
    const taxRate = taxRateRaw ? Number(taxRateRaw) / 100 : null;
    if (
      taxInclusiveAmount <= 0 ||
      netAmount < 0 ||
      taxAmount < 0 ||
      Math.abs(round(netAmount + taxAmount) - taxInclusiveAmount) > 0.01
    )
      return NextResponse.json(
        { error: "含税金额必须等于未税金额与税额之和。" },
        { status: 400 },
      );
    if (
      taxRate !== null &&
      (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1)
    )
      return NextResponse.json(
        { error: "税率应在 0% 至 100% 之间。" },
        { status: 400 },
      );
    const billing = await prisma.billingRequest.findFirst({
      where: { id, status: "PROCESSING", documentType: "DOMESTIC" },
      include: {
        customer:{select:{brandName:true}},
        lines: { orderBy: { sortOrder: "asc" } },
        manualItems: { orderBy: { sortOrder: "asc" } },
        invoices: { where: { deletedAt: null }, take: 1 },
      },
    });
    if (!billing)
      return NextResponse.json(
        { error: "国内发票申请不存在或尚未受理。" },
        { status: 404 },
      );
    if (billing.invoices.length)
      return NextResponse.json(
        { error: "该申请已经完成开票，请勿重复提交。" },
        { status: 409 },
      );
    const requestedGross = billing.requestedAmount;
    const requestedNet = billing.manualItems.length && billing.manualItems.every(item=>item.netAmount!==null) ? round(billing.manualItems.reduce((sum, item) => sum + Number(item.netAmount), 0)) : netAmount;
    if (Math.abs(taxInclusiveAmount - requestedGross) > 0.01 || Math.abs(netAmount - requestedNet) > 0.01)
      return NextResponse.json(
        { error: "发票含税/未税金额必须与开票申请逐行税额汇总一致。" },
        { status: 400 },
      );
    const domesticDetails=await resolveDomesticBillingDetails(prisma,billing.applicantNote,billing.customerId);
    const saved = await saveUploadedFile(file);
    const sourceItems = billing.manualItems.length
      ? billing.manualItems.map((item) => ({ projectConfirmationId: item.projectConfirmationId, feeType: item.feeType, currency: item.currency, periodType: item.periodType, periodLabel: item.periodLabel, description: item.description, promoPlatform: item.promoPlatform, targetSite: item.targetSite, affiliatePlatform: item.affiliatePlatform, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.amount, serviceMonths: item.serviceMonths, netAmount: item.netAmount, taxRate: item.taxRate, taxAmount: item.taxAmount, grossAmount: item.grossAmount, sortOrder: item.sortOrder }))
      : billing.lines.map((line, sortOrder) => ({ projectConfirmationId: line.projectConfirmationId, feeType: line.feeType === "FIXED_FEE" ? "MONTHLY_FEE" : "SALES_COMMISSION", currency: line.currency, periodType: "DATE_RANGE", periodLabel: "国内发票申请", description: line.feeType === "FIXED_FEE" ? "固定费" : "销售佣金", promoPlatform: null, targetSite: null, affiliatePlatform: null, quantity: 1, unitPrice: line.requestedAmount, amount: line.requestedAmount, serviceMonths: null, netAmount: null, taxRate: null, taxAmount: null, grossAmount: null, sortOrder }));
    const allocated=allocateDomesticAmounts(sourceItems,netAmount,taxAmount,taxRate);
    const domesticLines = sourceItems.map((item,index) => ({ description:item.description,quantity:item.quantity,unitPrice:item.unitPrice,...allocated[index],serviceMonths:item.serviceMonths,sortOrder:item.sortOrder }));
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNo: `CN-${billing.requestNo}`,
          customerId: billing.customerId,
          contractId: billing.contractId,
          billingRequestId: billing.id,
          documentType: "DOMESTIC",
          issuedAt: invoiceDate,
          invoiceDate,
          dueDate: invoiceDate,
          periodType: "DATE_RANGE",
          periodLabel: "国内发票",
          feeType:
            new Set(sourceItems.map((line) => line.feeType)).size > 1
              ? "MIXED"
              : sourceItems[0].feeType,
          clientName: domesticDetails?.invoiceTitle || billing.customer.brandName,
          currency: billing.currency,
          totalAmount: taxInclusiveAmount,
          bankSnapshot: "{}",
          status: "ISSUED",
          createdById: session.userId,
          items: {
            create: sourceItems.map((line) => ({
              projectConfirmationId: line.projectConfirmationId,
              feeType: line.feeType,
              currency: line.currency,
              periodType: line.periodType,
              periodLabel: line.periodLabel,
              description: line.description,
              promoPlatform: line.promoPlatform,
              targetSite: line.targetSite,
              affiliatePlatform: line.affiliatePlatform,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              amount: line.amount,
              sortOrder: line.sortOrder,
            })),
          },
          reconciliationLinks: billing.lines.length ? {
            create: billing.lines.map((line, sortOrder) => ({
              reconciliationId: line.reconciliationId,
              sortOrder,
            })),
          } : undefined,
          billingAllocations: billing.lines.length ? {
            create: billing.lines.map((line) => ({
              reconciliationId: line.reconciliationId,
              requestLineId: line.id,
              amount: line.requestedAmount,
              feeType: line.feeType,
              currency: line.currency,
            })),
          } : undefined,
          domesticDocument: {
            create: {
              invoiceCode,
              invoiceNumber,
              invoiceType,
              taxInclusiveAmount,
              netAmount,
              taxAmount,
              taxRate,
              originalFileUrl: saved.fileUrl,
              uploadedById: session.userId,
              uploadedAt: new Date(),
              lines: { create: domesticLines },
            },
          },
        },
        select: {
          id: true,
          invoiceNo: true,
          customerId: true,
          invoiceDate: true,
          dueDate: true,
          totalAmount: true,
          currency: true,
        },
      });
      const arCurrency = created.currency === "CNY" ? "RMB" : created.currency;
      await tx.financeAttachment.create({data:{entityType:"DOMESTIC_INVOICE",entityId:created.id,attachmentType:"INVOICE_ORIGINAL",fileUrl:saved.fileUrl,fileName:saved.fileName,uploadedById:session.userId}});
      const exchangeRate = arCurrency === "USD" ? 7.2 : 1;
      const receivable = await tx.accountsReceivable.create({
        data: {
          customerId: created.customerId,
          invoiceNo: created.invoiceNo,
          invoiceDate: created.invoiceDate,
          invoiceAmount: created.totalAmount,
          currency: arCurrency,
          exchangeRate,
          amountRmb: round(created.totalAmount * exchangeRate),
          dueDate: created.dueDate,
          status: "NOT_DUE",
          riskLevel: "GREEN",
        },
      });
      await tx.invoice.update({
        where: { id: created.id },
        data: { accountsReceivableId: receivable.id },
      });
      await tx.billingRequest.update({
        where: { id: billing.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await tx.financeApprovalStep.updateMany({where:{entityType:'BILLING_REQUEST',entityId:billing.id,stepNo:2,status:'PENDING'},data:{status:'APPROVED',operatorId:session.userId,actedAt:new Date(),comment:'国内发票归档完成'}});
      await recordFinanceEvent(tx,'BILLING_REQUEST',billing.id,session.userId,'DOMESTIC_ISSUED','国内发票归档完成','PROCESSING','COMPLETED');
      await tx.reminder.create({
        data: {
          title: `国内发票已开具：${invoiceNumber}`,
          content: `你的开票申请 ${billing.requestNo} 已完成。请在申请详情中下载发票原件。\n[[href:/finance/workbench?focusBillingRequest=${billing.id}]]`,
          remindDate: new Date(),
          type: "FINANCE_RESULT",
          targetId: billing.applicantId,
          createdById: session.userId,
        },
      });
      return created;
    });
    return NextResponse.json({ invoiceId: invoice.id }, { status: 201 });
  } catch (error) {
    if (error instanceof DomesticUploadError) return NextResponse.json({error:error.message},{status:error.status});
    if (error instanceof FeaturePermissionError)
      return NextResponse.json(
        { error: "无权限登记国内发票。" },
        { status: 403 },
      );
    return NextResponse.json(
      { error: "登记国内发票失败，请稍后重试；已填写内容请保留。" },
      { status: 500 },
    );
  }
}
