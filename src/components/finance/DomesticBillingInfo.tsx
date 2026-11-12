import { domesticInvoiceLabel, type DomesticBillingDetails } from '@/lib/domesticBilling';
export function DomesticBillingInfo({details}:{details?:DomesticBillingDetails|null}) {
  if(!details)return <p className="text-sm text-amber-800">未记录可用开票资料，请联系申请人补充确认，不要根据客户名称推测开票抬头。</p>;
  return <section className="space-y-2 border-t border-slate-200 pt-3 text-sm"><h3 className="font-semibold">国内发票开票资料 · {domesticInvoiceLabel(details.invoiceType)}</h3><p className="text-xs text-slate-600">{details.source==='SNAPSHOT'?'申请提交时保存的资料':'历史申请未保存资料快照：以下为当前关联资料，开票前请与申请人核对'}</p><dl className="grid gap-3 sm:grid-cols-2">{[['公司抬头',details.invoiceTitle],['税号',details.taxNumber],['注册地址',details.registeredAddress],['联系电话',details.registeredPhone],['开户行',details.bankName],['银行账号',details.bankAccount],['接收邮箱',details.deliveryEmail]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-600">{label}</dt><dd className="break-words">{value||'—'}</dd></div>)}</dl></section>;
}
