import type {Prisma} from '@prisma/client';

/** Preserve financial history; never retire receivables with receipt facts. */
export async function retireUnpaidInvoiceReceivable(tx:Prisma.TransactionClient,invoiceId:string){
  const invoice=await tx.invoice.findUniqueOrThrow({where:{id:invoiceId},select:{accountsReceivableId:true}});
  if(await tx.customerReceiptAllocation.count({where:{invoiceId,status:'ACTIVE'}}))throw new Error('票据已有有效收款核销，请先按财务流程冲销，不能直接作废或删除。');
  if(!invoice.accountsReceivableId)return;
  const ar=await tx.accountsReceivable.findUniqueOrThrow({where:{id:invoice.accountsReceivableId}});
  if(ar.receivedAmount!==0||ar.actualReceivedDate||await tx.customerReceiptAllocation.count({where:{accountsReceivableId:ar.id,status:'ACTIVE'}}))throw new Error('关联应收已有到账或核销记录，不能直接撤销。');
  if(await tx.invoice.count({where:{accountsReceivableId:ar.id,id:{not:invoiceId},deletedAt:null,status:'ISSUED'}}))throw new Error('该应收关联其他有效票据，请先由财务核对，不可单独撤销。');
  await tx.accountsReceivable.update({where:{id:ar.id},data:{status:'CANCELLED'}});
}
