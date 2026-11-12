import type { Prisma } from '@prisma/client';

export type FinanceRequestKind='BILLING_REQUEST'|'PAYMENT_REQUEST'|'EXPENSE_CLAIM';
export async function financeRequestSnapshot(tx:Prisma.TransactionClient,entityType:FinanceRequestKind,entityId:string){
  const record=entityType==='BILLING_REQUEST'
    ?await tx.billingRequest.findUnique({where:{id:entityId},include:{manualItems:true,lines:true}})
    :entityType==='PAYMENT_REQUEST'
      ?await tx.paymentRequest.findUnique({where:{id:entityId},include:{items:true}})
      :await tx.expenseClaim.findUnique({where:{id:entityId},include:{items:true}});
  if(!record)throw new Error('申请不存在。');
  const attachments=await tx.financeAttachment.findMany({where:{entityType,entityId},orderBy:{createdAt:'asc'}});
  return {record,attachments};
}
export async function captureFinanceRevision(tx:Prisma.TransactionClient,entityType:FinanceRequestKind,entityId:string,actorId:string){
  const last=await tx.financeRequestRevision.findFirst({where:{entityType,entityId},orderBy:{revisionNo:'desc'},select:{revisionNo:true}});
  const policy=await tx.financeApprovalPolicy.findUnique({where:{entityType}});
  const steps=await tx.financeApprovalStep.findMany({where:{entityType,entityId},orderBy:{stepNo:'asc'}});
  return tx.financeRequestRevision.create({data:{entityType,entityId,revisionNo:(last?.revisionNo??0)+1,snapshot:JSON.stringify(await financeRequestSnapshot(tx,entityType,entityId)),policySnapshot:JSON.stringify(policy??{reviewRequired:true,legacyDefault:true}),stepsSnapshot:JSON.stringify(steps),createdById:actorId}});
}
export async function recordFinanceEvent(tx:Prisma.TransactionClient,entityType:FinanceRequestKind,entityId:string,actorId:string,action:string,note?:string,fromStatus?:string,toStatus?:string){
  const revision=await tx.financeRequestRevision.findFirst({where:{entityType,entityId},orderBy:{revisionNo:'desc'},select:{revisionNo:true}});
  const steps=await tx.financeApprovalStep.findMany({where:{entityType,entityId},orderBy:{stepNo:'asc'}});
  await tx.financeAuditLog.create({data:{entityType,entityId,actorId,action,note,fromStatus,toStatus,metadata:JSON.stringify({revisionNo:revision?.revisionNo??0,steps})}});
}
