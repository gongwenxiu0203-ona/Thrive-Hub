import type { Prisma } from '@prisma/client';
import { normalizeFinanceUrls } from './financeApproval';

/** Bind freshly uploaded files within the same request transaction; external HTTPS URLs remain supported. */
export async function linkFinanceRequestAttachments(tx:Prisma.TransactionClient,kind:'PAYMENT_REQUEST'|'EXPENSE_CLAIM',id:string,userId:string,supporting:string[]|undefined,invoices:string[]){
  const raw=[...(supporting??[]),...invoices];
  if(raw.some(u=>typeof u!=='string'||(!/^\/uploads\/[^/]+$/.test(u.trim())&&!/^https:\/\//i.test(u.trim()))))throw new Error('附件地址无效。');
  const urls=normalizeFinanceUrls(raw);const locals=urls.filter(u=>u.startsWith('/uploads/'));
  const stagedType=kind==='PAYMENT_REQUEST'?'PAYMENT_STAGED':'EXPENSE_STAGED';
  const staged=locals.length?await tx.financeAttachment.findMany({where:{entityType:stagedType,entityId:userId,uploadedById:userId,fileUrl:{in:locals}}}):[];
  if(locals.some(u=>!staged.some(a=>a.fileUrl===u)))throw new Error('附件不属于本次上传，请重新上传后提交。');
  if(staged.length){const linked=await tx.financeAttachment.updateMany({where:{id:{in:staged.map(a=>a.id)},entityType:stagedType,entityId:userId,uploadedById:userId},data:{entityType:kind,entityId:id}});if(linked.count!==staged.length)throw new Error('附件已关联其他申请，请重新上传。');}
  const external=urls.filter(u=>u.startsWith('https://'));
  if(external.length)await tx.financeAttachment.createMany({data:external.map(fileUrl=>({entityType:kind,entityId:id,attachmentType:'SUPPORTING_DOCUMENT',fileUrl,uploadedById:userId}))});
}
