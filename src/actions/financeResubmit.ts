"use server";

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { requireFeaturePermission } from '@/lib/permissionGuard';
import { isStaff } from '@/lib/permissions';
import { createTwoStageFinanceApproval, normalizeFinanceUrls } from '@/lib/financeApproval';
import { captureFinanceRevision, financeRequestSnapshot, recordFinanceEvent, type FinanceRequestKind } from '@/lib/financeRequestHistory';
import { domesticMetadata } from '@/lib/domesticBilling';
import { resolveDomesticBillingDetails } from '@/lib/domesticBillingDetails';
import { validateOptionalPaymentReferences } from '@/lib/paymentReferences';
import { createPayeeSnapshot, isPayeeCategoryAllowed } from '@/lib/financePayee';
import type { submitManualBillingRequest, createSupplierAndPaymentRequest, createExpenseClaim } from './financeUnified';

type BaseBillingInput=Parameters<typeof submitManualBillingRequest>[0];
type BillingInput=Omit<BaseBillingInput,'items'>&{items:Array<BaseBillingInput['items'][number]&{id?:string;projectConfirmationId?:string|null}>};
type PaymentInput=Parameters<typeof createSupplierAndPaymentRequest>[0]&{items?:Array<{description:string;amount:number;currency?:string;invoiceUrls?:string|string[]}>};
type ExpenseInput=Parameters<typeof createExpenseClaim>[0];
const feature=(kind:FinanceRequestKind)=>kind==='BILLING_REQUEST'?'finance.billing_requests':kind==='PAYMENT_REQUEST'?'finance.payment_requests':'finance.expenses';
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const text=(s:string)=>s.trim().replace(/\s+/g,' ');
const currency=(s:string)=>{const v=s.trim().toUpperCase();if(!/^[A-Z]{3}$/.test(v))throw new Error('请选择有效币种。');return v;};
const json=(s:string|null|undefined):Record<string,unknown>=>{try{return JSON.parse(s||'{}');}catch{return {};}};
const date=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(new Date(s).getTime())||new Date(s).toISOString().slice(0,10)!==s)throw new Error('日期无效。');return new Date(`${s}T00:00:00.000Z`);};

async function authorize(kind:FinanceRequestKind){
  if(!['BILLING_REQUEST','PAYMENT_REQUEST','EXPENSE_CLAIM'].includes(kind))throw new Error('申请类型无效。');
  const session=await requireSession();await requireFeaturePermission(session,feature(kind),'EDIT');
  const actor=await prisma.user.findUnique({where:{id:session.userId},select:{role:true,status:true}});
  if(!actor||actor.status!=='APPROVED'||!isStaff(actor.role))throw new Error('仅已启用的内部员工可以编辑重提。');
  return {...session,role:actor.role};
}
async function editable(tx:Prisma.TransactionClient,kind:FinanceRequestKind,id:string,userId:string){
  const snap=await financeRequestSnapshot(tx,kind,id);const r=snap.record;
  const owner='employeeId' in r?r.employeeId:r.applicantId;
  if(owner!==userId)throw new Error('仅申请本人可以编辑重提。');
  if(r.status!=='REJECTED')throw new Error('仅已退回申请可以编辑重提，请刷新。');
  if('sourceType' in r){
    if(r.sourceType!=='MANUAL'||!('manualItems' in r))throw new Error('该申请来自对账业务，请回原对账流程修改，不能在此修改财务金额。');
    if(await tx.invoice.count({where:{billingRequestId:id}}))throw new Error('该申请已有票据事实，不能重提。');
    if('lines' in r&&r.lines.length)throw new Error('存在分摊关联的申请不能重提。');
  }else if(r.paidAt||normalizeFinanceUrls(r.paymentProofUrls).length||('transactionNo' in r&&r.transactionNo))throw new Error('该申请已有付款核销事实，不能重提。');
  if(snap.attachments.some(a=>a.attachmentType==='PAYMENT_PROOF'))throw new Error('该申请已有付款凭证，不能重提。');
  return snap;
}

export async function getFinanceRequestEditData(entityType:FinanceRequestKind,id:string){
  try{
    const session=await authorize(entityType);
    const data=await prisma.$transaction(async tx=>{
      const snapshot=await editable(tx,entityType,id,session.userId);const r=snapshot.record;
      if('manualItems' in r)r.manualItems.sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
      const step=await tx.financeApprovalStep.findFirst({where:{entityType,entityId:id,stepNo:1}});
      const revision=await tx.financeRequestRevision.findFirst({where:{entityType,entityId:id},orderBy:{revisionNo:'desc'}});
      const attachmentUrls=snapshot.attachments.filter(a=>['SUPPORTING_DOCUMENT','CUSTOMER_AMOUNT_CONFIRMATION'].includes(a.attachmentType)).map(a=>a.fileUrl);
      let input:BillingInput|PaymentInput|ExpenseInput;
      if('manualItems' in r){input={customerId:r.customerId,contractId:r.contractId||undefined,documentType:r.documentType as BillingInput['documentType'],note:r.applicantNote||undefined,attachmentUrls,reviewerId:step?.assigneeId||undefined,items:r.manualItems.map(i=>({...i,feeType:i.feeType as BillingInput['items'][number]['feeType'],periodType:i.periodType as 'MONTH'|'DATE_RANGE',promoPlatform:i.promoPlatform||undefined,targetSite:i.targetSite||undefined,affiliatePlatform:i.affiliatePlatform||undefined,remark:i.remark||undefined,netAmount:i.netAmount??undefined,taxRate:i.taxRate??undefined,serviceMonths:JSON.parse(i.serviceMonths||'[]')}))};}
      else if('supplierId' in r){const p=json(r.payeeSnapshot);const supplier=r.supplierId?await tx.supplier.findUnique({where:{id:r.supplierId}}):null;input={supplierName:supplier?.name||String(p.name||p.accountName||''),supplierType:r.requestType,country:String(p.country||''),accountName:String(p.accountName||''),accountNumber:String(p.accountNumber||''),bankName:String(p.bankName||''),swiftCode:String(p.swiftCode||''),payeeMode:(p.paymentMethod|| (p.payeeProfileId?'PROFILE':'NONE')) as PaymentInput['payeeMode'],payeeAccountProfileId:p.payeeProfileId?String(p.payeeProfileId):undefined,payerAccountProfileId:p.payerProfileId?String(p.payerProfileId):undefined,payerEntity:r.payerEntity,payerAccountKey:r.payerAccountKey||undefined,reason:r.reason,currency:r.currency,amount:r.amount,scheduledAt:r.scheduledAt?.toISOString().slice(0,10),relatedInvoiceId:r.relatedInvoiceId||undefined,relatedReceiptId:r.relatedReceiptId||undefined,note:r.note||undefined,invoiceUrls:r.items.flatMap(i=>{try{return JSON.parse(i.invoiceUrls);}catch{return [];}}),attachmentUrls,reviewerId:step?.assigneeId||undefined};}
      else {const p=json(r.payeeSnapshot);input={reimbursementEntity:r.reimbursementEntity,currency:r.currency,accountName:String(p.accountName||''),accountNumber:String(p.accountNumber||''),note:r.note||undefined,attachmentUrls,reviewerId:step?.assigneeId||undefined,items:r.items.map(i=>({...i,expenseDate:i.expenseDate.toISOString().slice(0,10),invoiceTitle:i.invoiceTitle||undefined,invoiceNumber:i.invoiceNumber||undefined,remark:i.remark||undefined,invoiceUrls:JSON.parse(i.invoiceUrls||'[]')}))};}
      if('supplierId' in r&&'supplierType' in input)input.items=[...r.items].sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id)).map(i=>({description:i.description,amount:i.amount,currency:i.currency,invoiceUrls:JSON.parse(i.invoiceUrls||'[]')}));
      return {entityType,id,requestNo:'claimNo'in r?r.claimNo:r.requestNo,updatedAt:r.updatedAt,record:r,attachments:snapshot.attachments,revisionNo:revision?.revisionNo??0,reviewerId:step?.assigneeId||undefined,input};
    });
    return {ok:true as const,data};
  }catch(error){return {ok:false as const,error:error instanceof Error?error.message:'读取申请失败。'};}
}

/** Keep attachment bytes and historical rows; only the current revision's selection changes. */
async function replaceAttachments(tx:Prisma.TransactionClient,kind:FinanceRequestKind,id:string,userId:string,urls:string[]|undefined,invoiceUrls:string[]=[]){
  const raw=[...(urls??[]),...invoiceUrls];
  if(raw.some(u=>typeof u!=='string'||(!/^\/uploads\/[^/]+$/.test(u.trim())&&!/^https:\/\//i.test(u.trim()))))throw new Error('附件地址无效。');
  const selected=normalizeFinanceUrls(urls);const all=[...new Set([...selected,...invoiceUrls])];
  const owned=await tx.financeAttachment.findMany({where:{fileUrl:{in:all},OR:[{entityType:kind,entityId:id},{entityType:{in:['BILLING_STAGED','PAYMENT_STAGED','EXPENSE_STAGED']},entityId:userId,uploadedById:userId}]}});
  // Older payment/expense uploads were stored only on item rows, without attachment rows.
  const originalItems=kind==='PAYMENT_REQUEST'?await tx.paymentRequestItem.findMany({where:{paymentRequestId:id},select:{invoiceUrls:true}}):kind==='EXPENSE_CLAIM'?await tx.expenseClaimItem.findMany({where:{expenseClaimId:id},select:{invoiceUrls:true}}):[];
  const originalUrls=originalItems.flatMap(i=>{try{return JSON.parse(i.invoiceUrls) as string[];}catch{return [];}});
  if(all.filter(u=>u.startsWith('/uploads/')).some(u=>!owned.some(a=>a.fileUrl===u)&&!originalUrls.includes(u)))throw new Error('附件不属于本申请或本次上传，请重新上传。');
  // Archive references rather than unlinking/deleting originals used by old snapshots.
  await tx.financeAttachment.updateMany({where:{entityType:kind,entityId:id,attachmentType:{in:['SUPPORTING_DOCUMENT','CUSTOMER_AMOUNT_CONFIRMATION']}},data:{attachmentType:'REVISION_ARCHIVE'}});
  const staged=owned.filter(a=>a.entityType.endsWith('_STAGED'));
  if(staged.length)await tx.financeAttachment.updateMany({where:{id:{in:staged.map(a=>a.id)},uploadedById:userId,entityId:userId},data:{entityType:kind,entityId:id,attachmentType:'REVISION_ARCHIVE'}});
  // Invoice-only uploads also need a request-linked row for authenticated downloads.
  const invoiceOnly=invoiceUrls.filter(u=>!selected.includes(u)&&!owned.some(a=>a.entityType===kind&&a.fileUrl===u));
  if(invoiceOnly.length)await tx.financeAttachment.createMany({data:invoiceOnly.map(fileUrl=>({entityType:kind,entityId:id,attachmentType:'INVOICE_ORIGINAL',fileUrl,uploadedById:userId}))});
  if(selected.length)await tx.financeAttachment.createMany({data:selected.map(fileUrl=>({entityType:kind,entityId:id,attachmentType:kind==='BILLING_REQUEST'?'CUSTOMER_AMOUNT_CONFIRMATION':'SUPPORTING_DOCUMENT',fileUrl,uploadedById:userId}))});
}

async function resubmit(kind:FinanceRequestKind,id:string,reviewerId:string|undefined,update:(tx:Prisma.TransactionClient,userId:string)=>Promise<void>){
  try{
    const session=await authorize(kind);
    if(reviewerId===session.userId&&session.role!=='ADMIN')throw new Error('非管理员申请人不能选择自己作为审核人。');
    await prisma.$transaction(async tx=>{
      const old=await editable(tx,kind,id,session.userId);
      // First write is a compare-and-swap. All captures and replacements roll back on conflict.
      const where={id,status:'REJECTED',updatedAt:old.record.updatedAt};
      const claim=kind==='BILLING_REQUEST'?await tx.billingRequest.updateMany({where,data:{status:'SUBMITTED'}}):kind==='PAYMENT_REQUEST'?await tx.paymentRequest.updateMany({where,data:{status:'SUBMITTED'}}):await tx.expenseClaim.updateMany({where,data:{status:'SUBMITTED'}});
      if(claim.count!==1)throw new Error('申请已被其他操作修改，请刷新。');
      // Capture exact rejected contents and acted steps before overwriting the live round.
      const originalRevision=await tx.financeRequestRevision.findFirst({where:{entityType:kind,entityId:id},orderBy:{revisionNo:'desc'},select:{policySnapshot:true}});
      const previous=await captureFinanceRevision(tx,kind,id,session.userId);
      await tx.financeRequestRevision.update({where:{id:previous.id},data:{snapshot:JSON.stringify(old),...(originalRevision?{policySnapshot:originalRevision.policySnapshot}:{})}});
      await recordFinanceEvent(tx,kind,id,session.userId,'REVISION_ARCHIVED','保存退回版本','REJECTED','REJECTED');
      await update(tx,session.userId);
      await tx.financeApprovalStep.deleteMany({where:{entityType:kind,entityId:id}});
      await tx.reminder.updateMany({where:{content:{contains:id},type:{in:['BILLING_REVIEW','PAYMENT_REVIEW','EXPENSE_REVIEW','FINANCE_RESULT']},isRead:false},data:{isRead:true}});
      const reviewer=await createTwoStageFinanceApproval(tx,kind,id,reviewerId);
      if(reviewer.reviewRequired)await tx.reminder.create({data:{title:'财务申请已修改重提',content:`申请人已修改重提，请重新审核。\n[[href:/finance/workbench?${kind==='BILLING_REQUEST'?`focusBillingRequest=${id}`:`mainTab=PAYMENT&focusRequest=${id}`}]]`,remindDate:new Date(),type:kind==='BILLING_REQUEST'?'BILLING_REVIEW':kind==='PAYMENT_REQUEST'?'PAYMENT_REVIEW':'EXPENSE_REVIEW',targetId:reviewer.id,createdById:session.userId}});
      await captureFinanceRevision(tx,kind,id,session.userId);
      await recordFinanceEvent(tx,kind,id,session.userId,'RESUBMIT','同单修改后重新提交','REJECTED',kind!=='BILLING_REQUEST'&&!reviewer.reviewRequired?'APPROVED':'SUBMITTED');
    });
    revalidatePath('/finance/workbench');return {ok:true as const,id,request:{id}};
  }catch(error){return {ok:false as const,error:error instanceof Error?error.message:'修改重提失败。'};}
}

export async function resubmitManualBillingRequest(id:string,input:BillingInput){
  return resubmit('BILLING_REQUEST',id,input.reviewerId,async(tx,userId)=>{
    if(!['INVOICE','DOMESTIC'].includes(input.documentType)||!input.items.length||input.items.length>50)throw new Error('请选择票据类型并填写1至50条明细。');
    const original=await tx.billingRequest.findUniqueOrThrow({where:{id},include:{manualItems:{orderBy:[{sortOrder:'asc'},{id:'asc'}]}}});
    const linked=original.manualItems.some(i=>i.projectConfirmationId);
    if(linked){
      if(input.customerId!==original.customerId||(input.contractId||null)!==original.contractId||input.documentType!==original.documentType||input.items.length!==original.manualItems.length)throw new Error('项目关联申请必须保留原客户、合同、票据类型和明细行数，不能修改项目归属。');
      input.items.forEach((item,index)=>{const prev=original.manualItems[index];if(item.id!==prev.id||item.feeType!==prev.feeType||item.periodType!==prev.periodType||item.periodLabel!==prev.periodLabel||(item.projectConfirmationId!==undefined&&(item.projectConfirmationId||null)!==prev.projectConfirmationId))throw new Error('项目关联明细不可增加、删除、重排或更换项目/服务期间；请保留原明细次序。');});
    }else if(input.items.some(i=>i.projectConfirmationId))throw new Error('不能通过编辑重提新增项目关联，请从合同项目流程发起。');
    const customer=await tx.customer.findFirst({where:{id:input.customerId,deletedAt:null}});if(!customer)throw new Error('客户不存在。');
    if(input.contractId&&!await tx.contract.findFirst({where:{id:input.contractId,customerId:input.customerId}}))throw new Error('合同不属于所选客户。');
    const descriptions={MONTHLY_FEE:'月度服务费',SALES_COMMISSION:'销售佣金',AFFILIATE_FEE:'联盟商费用',SINGLE_CHANNEL_FEE:'单渠道费用'};
    const items=input.items.map((i,sortOrder)=>{
      if(!Object.hasOwn(descriptions,i.feeType)||!['MONTH','DATE_RANGE'].includes(i.periodType)||!i.periodLabel.trim()||(i.remark?.length??0)>2000)throw new Error('费用类型、服务期间或备注无效。');
      if(!Number.isFinite(i.quantity)||i.quantity<=0||!Number.isFinite(i.unitPrice)||i.unitPrice<=0)throw new Error('数量和单价必须大于0。');
      const months=[...new Set(i.serviceMonths??[])];if(months.some(m=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)))throw new Error('服务月份格式无效。');
      const domestic=input.documentType==='DOMESTIC';const netAmount=domestic?round(Number(i.netAmount)):null;const taxRate=domestic?Number(i.taxRate):null;
      if(domestic&&(!months.length||!Number.isFinite(netAmount)||netAmount!<=0||!Number.isFinite(taxRate)||taxRate!<0||taxRate!>1))throw new Error('请填写有效服务月份、未税额和税率。');
      const taxAmount=domestic?round(netAmount!*taxRate!):null;const grossAmount=domestic?round(netAmount!+taxAmount!):null;
      return {projectConfirmationId:linked?original.manualItems[sortOrder].projectConfirmationId:null,description:descriptions[i.feeType],feeType:i.feeType,currency:currency(i.currency),periodType:i.periodType,periodLabel:text(i.periodLabel),promoPlatform:i.promoPlatform?.trim()||null,targetSite:i.targetSite?.trim()||null,affiliatePlatform:i.affiliatePlatform?.trim()||null,quantity:i.quantity,unitPrice:round(i.unitPrice),amount:grossAmount??round(i.quantity*i.unitPrice),serviceMonths:JSON.stringify(months),netAmount,taxRate,taxAmount,grossAmount,remark:i.remark?.trim()||null,sortOrder};
    });
    if(new Set(items.map(i=>i.currency)).size!==1)throw new Error('明细币种必须一致。');
    let applicantNote=input.note?.trim()||null;
    if(input.documentType==='DOMESTIC'){const meta=domesticMetadata(input.note);if(!['NORMAL','SPECIAL','VAT_ORDINARY','VAT_SPECIAL'].includes(meta.invoiceKind||''))throw new Error('请选择普票或专票。');const details=await resolveDomesticBillingDetails(tx,input.note,input.customerId,true);if(!details)throw new Error('开票资料不存在或已停用，请重新选择。');applicantNote='DOMESTIC_META:'+JSON.stringify({profileId:meta.profileId,invoiceKind:meta.invoiceKind,snapshot:{...details,source:'SNAPSHOT'}});}
    await replaceAttachments(tx,'BILLING_REQUEST',id,userId,input.attachmentUrls);
    await tx.billingRequest.update({where:{id},data:{customerId:input.customerId,contractId:input.contractId||null,legalEntityKey:customer.brandName,documentType:input.documentType,currency:items[0].currency,requestedAmount:round(items.reduce((s,i)=>s+i.amount,0)),applicantNote,rejectionReason:null,acceptedById:null,acceptedAt:null,completedAt:null,submittedAt:new Date(),manualItems:{deleteMany:{},create:items}}});
  });
}

export async function resubmitSupplierPaymentRequest(id:string,input:PaymentInput){
  return resubmit('PAYMENT_REQUEST',id,input.reviewerId,async(tx,userId)=>{
    const amount=round(Number(input.amount));const curr=currency(input.currency);if(!input.supplierName.trim()||!input.accountName.trim()||!input.reason.trim()||!Number.isFinite(amount)||amount<=0)throw new Error('请填写完整收款对象、付款事由和有效金额。');
    const payer=input.payerAccountProfileId?await tx.financeAccountProfile.findFirst({where:{id:input.payerAccountProfileId,status:'ACTIVE',accountType:{in:['COMPANY_PAYER','COMPANY_BANK']}}}):null;if(!payer)throw new Error('付款账户不存在或已停用，请重新选择。');
    const mode=input.payeeMode??(input.payeeAccountProfileId?'PROFILE':'NONE');if(!['PROFILE','NONE','PAYONEER'].includes(mode)||(mode!=='PROFILE'&&input.payeeAccountProfileId))throw new Error('收款方式无效。');
    const payee=mode==='PROFILE'&&input.payeeAccountProfileId?await tx.financeAccountProfile.findFirst({where:{id:input.payeeAccountProfileId,status:'ACTIVE'}}):null;if(mode==='PROFILE'&&!payee)throw new Error('收款账户不存在或已停用，请重新选择。');
    const requestType=input.supplierType.toUpperCase();if(!['SUPPLIER','CHANNEL','AFFILIATE','REIMBURSEMENT','OTHER'].includes(requestType))throw new Error('付款类别无效。');if(payee&&!isPayeeCategoryAllowed(requestType,payee.accountType))throw new Error('收款账户分类与付款分类不匹配。');
    await validateOptionalPaymentReferences(tx,input.relatedInvoiceId,input.relatedReceiptId);
    const supplierName=text(input.supplierName);let supplier=await tx.supplier.findFirst({where:{name:supplierName,type:requestType,status:'ACTIVE'}});if(!supplier)supplier=await tx.supplier.create({data:{supplierNo:`SUP-${crypto.randomUUID()}`,name:supplierName,type:requestType,country:input.country||null}});
    const snapshot={...createPayeeSnapshot(payee??{name:supplierName,accountName:text(input.accountName),accountNumber:'',bankName:null,swiftCode:null,country:input.country||null,currency:curr}),paymentMethod:mode,payeeProfileId:payee?.id??null,payerProfileId:payer.id,payerAccountName:payer.accountName,payerAccountNumber:payer.accountNumber};
    const originalItems=await tx.paymentRequestItem.findMany({where:{paymentRequestId:id},orderBy:[{sortOrder:'asc'},{id:'asc'}]});
    const rows=input.items??(originalItems.length>1?originalItems.map(i=>({...i,invoiceUrls:JSON.parse(i.invoiceUrls||'[]') as string[]})):[{description:text(input.reason),amount,currency:curr,invoiceUrls:normalizeFinanceUrls(input.invoiceUrls)}]);
    if(!rows.length||rows.length>50)throw new Error('请填写1至50条付款明细。');
    const items=rows.map((item,sortOrder)=>{const value=round(Number(item.amount));const itemCurrency=currency(item.currency||curr);if(!item.description.trim()||!Number.isFinite(value)||value<=0||itemCurrency!==curr)throw new Error('每条付款明细须填写说明、正数金额，且币种须与申请一致。');return {description:text(item.description),amount:value,currency:itemCurrency,invoiceUrls:JSON.stringify(normalizeFinanceUrls(item.invoiceUrls)),sortOrder};});
    if(Math.abs(round(items.reduce((sum,i)=>sum+i.amount,0))-amount)>0.001)throw new Error('付款明细合计必须等于申请总额；多明细申请变更金额请逐条编辑明细。');
    const invoiceUrls=items.flatMap(i=>JSON.parse(i.invoiceUrls) as string[]);await replaceAttachments(tx,'PAYMENT_REQUEST',id,userId,input.attachmentUrls,invoiceUrls);
    await tx.paymentRequest.update({where:{id},data:{supplierId:supplier.id,requestType,payerEntity:payer.legalEntity,payerAccountKey:payer.payerAccountKey??payer.id,payeeSnapshot:JSON.stringify(snapshot),reason:text(input.reason),currency:curr,amount,scheduledAt:input.scheduledAt?date(input.scheduledAt):null,relatedInvoiceId:input.relatedInvoiceId||null,relatedReceiptId:input.relatedReceiptId||null,note:input.note?.trim()||null,rejectionReason:null,approvedById:null,approvedAt:null,items:{deleteMany:{},create:items}}});
  });
}

export async function resubmitEmployeeExpenseClaim(id:string,input:ExpenseInput){
  return resubmit('EXPENSE_CLAIM',id,input.reviewerId,async(tx,userId)=>{
    const curr=currency(input.currency);if(!input.reimbursementEntity.trim()||!input.accountName.trim()||!input.accountNumber.trim()||!input.items.length||input.items.length>50)throw new Error('请完整填写报销主体、账户和1至50条明细。');
    const items=input.items.map((i,sortOrder)=>{const amount=round(Number(i.amount));if(!i.description.trim()||!i.expenseType||!Number.isFinite(amount)||amount<=0)throw new Error('费用明细无效。');return {description:text(i.description),expenseType:i.expenseType,expenseDate:date(i.expenseDate),currency:curr,amount,invoiceTitle:i.invoiceTitle?.trim()||null,invoiceNumber:i.invoiceNumber?.replace(/\s+/g,'').toUpperCase()||null,invoiceUrls:JSON.stringify(normalizeFinanceUrls(i.invoiceUrls)),remark:i.remark?.trim()||null,sortOrder};});
    await replaceAttachments(tx,'EXPENSE_CLAIM',id,userId,input.attachmentUrls,input.items.flatMap(i=>normalizeFinanceUrls(i.invoiceUrls)));
    const prior=await tx.expenseClaim.findUniqueOrThrow({where:{id},select:{payeeSnapshot:true}});
    await tx.expenseClaim.update({where:{id},data:{reimbursementEntity:text(input.reimbursementEntity),currency:curr,totalAmount:round(items.reduce((s,i)=>s+i.amount,0)),payeeSnapshot:JSON.stringify({...json(prior.payeeSnapshot),accountName:text(input.accountName),accountNumber:input.accountNumber.replace(/\s+/g,'')}),note:input.note?.trim()||null,rejectionReason:null,approvedById:null,approvedAt:null,items:{deleteMany:{},create:items}}});
  });
}
