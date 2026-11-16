"use client";
import { useState } from 'react';

export type ChannelContractRuleInitial = { ruleType: string; commissionThresholdAmount: number; commissionBelowRate: number; commissionAtOrAboveRate: number; tieredRules: string };
export function ChannelContractRuleFields({initial}:{initial?:ChannelContractRuleInitial|null}) {
  const [type,setType]=useState(initial?.ruleType ?? 'A');
  const [threshold,setThreshold]=useState(String(initial?.commissionThresholdAmount ?? 4400));
  const [below,setBelow]=useState(String((initial?.commissionBelowRate ?? .15)*100));
  const [above,setAbove]=useState(String((initial?.commissionAtOrAboveRate ?? .25)*100));
  const [tiers,setTiers]=useState(()=>{try {const list=JSON.parse(initial?.tieredRules ?? '[]') as {gmvMin:number;gmvMax:number|null;rate:number}[]; if(list.length)return list.map(t=>({min:String(t.gmvMin),max:t.gmvMax===null?'':String(t.gmvMax),percent:String(t.rate*100)}));}catch{} return [{min:'0',max:'100000',percent:'15'},{min:'100000',max:'',percent:'20'}];});
  return <div className="space-y-3 border-t border-slate-200 pt-4">
    <label className="block space-y-1 text-sm font-medium text-slate-700">佣金分账规则<select className="input" name="splitRuleType" value={type} onChange={e=>setType(e.target.value)}><option value="A">A 基础规则 · 到账佣金整档选比例</option><option value="B">B 特殊规则 · GMV 累进阶梯</option></select></label>
    {type==='A'? <><div className="grid gap-3 sm:grid-cols-3">{[['佣金到账阈值（USD）','commissionThresholdAmount',threshold,setThreshold],['低于阈值的乙方比例（%）','commissionBelowPercent',below,setBelow],['达到或超过阈值的乙方比例（%）','commissionAtOrAbovePercent',above,setAbove]].map(([label,name,value,set])=><label className="space-y-1 text-xs text-slate-600" key={String(name)}>{String(label)}<input className="input bg-white" type="number" min="0" max={name==='commissionThresholdAmount'?undefined:100} step="0.01" name={String(name)} value={String(value)} onChange={e=>(set as (v:string)=>void)(e.target.value)} required /></label>)}</div><p className="text-xs text-slate-600">低于 USD {threshold} 按 {below}%；达到或超过按 {above}%。按实际到账佣金整笔计提，不累进分段。</p></>:
    <><input type="hidden" name="tieredRules" value={JSON.stringify(tiers.map(t=>({gmvMin:Number(t.min),gmvMax:t.max===''?null:Number(t.max),rate:Number(t.percent)/100})))} /><p className="text-xs text-slate-600">按确认 GMV 分档累进计算，上限为实际到账佣金；最后一档上限留空表示无限。</p>{tiers.map((tier,i)=><div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2" key={i}>{(['min','max','percent'] as const).map((key,j)=><label key={key} className="text-xs text-slate-600">{['GMV 下限','GMV 上限','乙方比例（%）'][j]}<input className="input bg-white" type="number" min="0" max={key==='percent'?100:undefined} step="0.01" required={key!=='max'} value={tier[key]} onChange={e=>setTiers(tiers.map((t,k)=>k===i?{...t,[key]:e.target.value}:t))} /></label>)}<button type="button" className="self-end p-2 text-sm text-rose-700" onClick={()=>setTiers(tiers.filter((_,k)=>k!==i))} disabled={tiers.length===1}>删除</button></div>)}<button type="button" className="btn-secondary btn-sm" onClick={()=>setTiers([...tiers,{min:tiers.at(-1)?.max||'',max:'',percent:''}])}>添加一档</button></>}
  </div>;
}
