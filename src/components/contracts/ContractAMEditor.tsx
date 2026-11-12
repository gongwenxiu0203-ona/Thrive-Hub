"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { assignContractAM } from "@/actions/contractAM";
export type AMOption = { id: string; label: string };
export function ContractAMEditor({contracts,users,initialIds=[],bulk=false,open:controlledOpen,onClose}:{contracts:AMOption[];users:AMOption[];initialIds?:string[];bulk?:boolean;open?:boolean;onClose?:()=>void}) {
  const [ownOpen,setOpen]=useState(false),[amIds,setAMIds]=useState(initialIds),[query,setQuery]=useState(""),[error,setError]=useState("");
  const [mode,setMode]=useState<"APPEND"|"REPLACE"|"CLEAR">("APPEND");
  const [pending,start]=useTransition();const router=useRouter();
  const close=()=>{if(!pending){setOpen(false);onClose?.();}};
  const filtered=users.filter(user=>user.label.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    {controlledOpen===undefined&&<button type="button" className="btn-secondary text-sm" onClick={()=>{setAMIds(initialIds);setMode("APPEND");setQuery("");setError("");setOpen(true);}}>设置 AM</button>}
    <Modal open={controlledOpen??ownOpen} onClose={close} title={bulk?"批量设置 AM":"设置合同 AM"} size="md"><div className="space-y-4">
      <p className="text-sm text-slate-700">{bulk?`已选 ${contracts.length} 份合同，本次同步设置所选合同的 AM。`:"选择负责该合同的 AM，可同时分配多个账号。"}</p>
      <label className="block text-sm"><span className="label">设置方式</span><select className="input" value={mode} disabled={pending} onChange={e=>setMode(e.target.value as typeof mode)}><option value="APPEND">追加 AM（保留原分配）</option><option value="REPLACE">替换 AM（覆盖原分配）</option><option value="CLEAR">清除 AM（移除全部分配）</option></select></label>
      {mode!=="CLEAR"&&<div className="space-y-2 text-sm"><span className="block font-medium text-slate-700">AM 账号（可多选）</span><details className="rounded-md border border-slate-300"><summary className="cursor-pointer px-3 py-2 focus-visible:outline-brand-600">{amIds.length?`已选 ${amIds.length} 个账号，点击调整`:"请选择系统注册账号"}</summary><div className="border-t border-slate-200 p-2"><input aria-label="搜索 AM 账号" className="input mb-2" placeholder="搜索姓名或邮箱" value={query} onChange={e=>setQuery(e.target.value)}/><div className="max-h-52 overflow-y-auto">{filtered.map(user=><label className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 hover:bg-slate-50" key={user.id}><input type="checkbox" className="mt-1" disabled={pending} checked={amIds.includes(user.id)} onChange={e=>setAMIds(e.target.checked?[...amIds,user.id]:amIds.filter(id=>id!==user.id))}/><span className="break-all">{user.label}</span></label>)}{!filtered.length&&<p className="p-2 text-slate-600">没有匹配的已启用账号。</p>}</div></div></details><p className="break-words text-xs text-slate-600">{users.filter(user=>amIds.includes(user.id)).map(user=>user.label).join("；")||"尚未选择账号"}</p></div>}
      {mode==="CLEAR"&&<p className="text-sm text-amber-800">保存后将清除{bulk?"所选合同":"当前合同"}的全部 AM 分配，历史提醒仍保留。</p>}
      {mode==="REPLACE"&&<p className="text-sm text-amber-800">保存后将以本次选择的账号替换原 AM 分配；未选中的原 AM 将被移除。</p>}
      <p className="text-xs text-slate-600">仅列出已启用账号；AM 分配不扩大数据权限。飞书仅支持已绑定并启用推送的内部账号。</p>
      {error&&<p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={pending} onClick={close}>取消</button><button type="button" className="btn-primary" disabled={pending||!contracts.length||(mode!=="CLEAR"&&!amIds.length)} onClick={()=>start(async()=>{setError("");const result=await assignContractAM(contracts.map(c=>c.id),amIds,mode);if(!result.ok)setError(result.error||"保存失败");else{setOpen(false);onClose?.();router.refresh();}})}>{pending?"保存中…":"保存 AM 分配"}</button></div>
    </div></Modal>
  </>;
}
