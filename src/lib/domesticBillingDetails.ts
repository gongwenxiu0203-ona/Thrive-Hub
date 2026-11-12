import type { PrismaClient, Prisma } from '@prisma/client';
import { domesticMetadata, domesticInvoiceType, type DomesticBillingDetails } from './domesticBilling';
export async function resolveDomesticBillingDetails(db: PrismaClient | Prisma.TransactionClient, note:string|null|undefined, customerId:string, snapshotOnly=false):Promise<DomesticBillingDetails|null> {
  const meta=domesticMetadata(note);
  if(!snapshotOnly&&meta.snapshot) return {...meta.snapshot,source:'SNAPSHOT'};
  if(!meta.profileId)return null;
  const profile=await db.customerBillingProfile.findFirst({where:{id:meta.profileId,customerId,...(snapshotOnly?{status:'ACTIVE'}:{})}});
  if(profile)return {invoiceTitle:profile.invoiceTitle,taxNumber:profile.taxNumber||'',registeredAddress:profile.registeredAddress||'',registeredPhone:profile.registeredPhone||'',bankName:profile.bankName||'',bankAccount:profile.bankAccount||'',deliveryEmail:profile.deliveryEmail||'',invoiceType:domesticInvoiceType(meta.invoiceKind),source:'CURRENT'};
  const shared=await db.financeAccountProfile.findFirst({where:{id:meta.profileId,accountType:'CUSTOMER_BILLING',...(snapshotOnly?{status:'ACTIVE'}:{})}});
  if(!shared)return null;
  return {invoiceTitle:shared.accountName,taxNumber:shared.swiftCode||'',registeredAddress:shared.payeeAddress||'',registeredPhone:'',bankName:shared.bankName||'',bankAccount:shared.accountNumber||'',deliveryEmail:'',invoiceType:domesticInvoiceType(meta.invoiceKind),source:'CURRENT'};
}
