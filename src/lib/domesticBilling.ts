export type DomesticBillingDetails = { invoiceTitle: string; taxNumber: string; invoiceType: string; registeredAddress: string; registeredPhone: string; bankName: string; bankAccount: string; deliveryEmail: string; source: "SNAPSHOT" | "CURRENT" };
export function domesticMetadata(note?: string | null): {profileId?:string; invoiceKind?:string; snapshot?:DomesticBillingDetails} {
  if(note?.startsWith('DOMESTIC_META:')) {try {
    const raw=JSON.parse(note.slice(14));
    if(!raw||typeof raw!=='object')return {};
    const snapshot=raw.snapshot;
    const valid=snapshot&&typeof snapshot==='object'&&['invoiceTitle','taxNumber','invoiceType','registeredAddress','registeredPhone','bankName','bankAccount','deliveryEmail'].every(key=>typeof snapshot[key]==='string');
    return {profileId:typeof raw.profileId==='string'?raw.profileId:undefined,invoiceKind:typeof raw.invoiceKind==='string'?raw.invoiceKind:undefined,...(valid?{snapshot}: {})};
  }catch{return {};}}
  return {profileId:note?.match(/开票资料:([^;\s]+)/)?.[1],invoiceKind:note?.match(/发票类型:([^;\s]+)/)?.[1]};
}
export const domesticInvoiceType = (kind?:string) => kind==='SPECIAL'||kind==='VAT_SPECIAL'?'VAT_SPECIAL':'VAT_ORDINARY';
export const domesticInvoiceLabel = (kind?:string) => domesticInvoiceType(kind)==='VAT_SPECIAL'?'增值税专用发票':'增值税普通发票';
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function domesticPrefill(total:number, items:Array<{netAmount?:number|null;taxAmount?:number|null;taxRate?:number|null;amount?:number|null}> = []) {
  const known=items.length>0&&items.every(x=>x.netAmount!=null&&x.taxAmount!=null);
  const net=known?round(items.reduce((n,x)=>n+Number(x.netAmount),0)):round(total/1.01);
  const tax=round(total-net);
  const reliable=known&&Math.abs(round(net+items.reduce((n,x)=>n+Number(x.taxAmount),0))-total)<.011;
  const finalNet=reliable?net:round(total/1.01);
  const finalTax=round(total-finalNet);
  const rates=[...new Set(items.map(x=>x.taxRate).filter(x=>x!=null))];
  return {netAmount:finalNet,taxAmount:finalTax,taxInclusiveAmount:round(total),taxRate:reliable?(rates.length===1?Number(rates[0])*100:finalTax/finalNet*100):1};
}

export function allocateDomesticAmounts(items:Array<{amount:number;netAmount?:number|null;taxAmount?:number|null;grossAmount?:number|null;taxRate?:number|null}>,net:number,tax:number,rate:number|null) {
  const complete=items.every(x=>x.netAmount!=null&&x.taxAmount!=null&&x.grossAmount!=null);
  if(complete&&Math.abs(round(items.reduce((s,x)=>s+Number(x.netAmount),0))-net)<.011&&Math.abs(round(items.reduce((s,x)=>s+Number(x.taxAmount),0))-tax)<.011) return items.map(x=>({netAmount:Number(x.netAmount),taxAmount:Number(x.taxAmount),taxInclusiveAmount:Number(x.grossAmount),taxRate:x.taxRate??rate??0}));
  const total=items.reduce((s,x)=>s+x.amount,0);
  let usedNet=0,usedGross=0;
  return items.map((item,index)=>{
    const last=index===items.length-1;
    const lineNet=last?round(net-usedNet):round(net*item.amount/total);
    const gross=last?round(net+tax-usedGross):round((net+tax)*item.amount/total);
    usedNet=round(usedNet+lineNet);usedGross=round(usedGross+gross);
    return {netAmount:lineNet,taxAmount:round(gross-lineNet),taxInclusiveAmount:gross,taxRate:rate??0};
  });
}
