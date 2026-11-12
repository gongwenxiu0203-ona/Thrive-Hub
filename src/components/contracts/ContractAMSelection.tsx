"use client";
import { createContext,useContext,useRef,useEffect,useState,type ReactNode } from "react";
import { ContractAMEditor,type AMOption } from "./ContractAMEditor";
type Selection={ids:string[];selected:string[];toggle:(id?:string)=>void;canEdit:boolean;users:AMOption[]};
const Context=createContext<Selection|null>(null);
export function ContractAMSelectionProvider({ids,users,canEdit,children}:{ids:string[];users:AMOption[];canEdit:boolean;children:ReactNode}){
  const [selected,setSelected]=useState<string[]>([]);
  const toggle=(id?:string)=>setSelected(current=>id?current.includes(id)?current.filter(value=>value!==id):[...current,id]:current.length===ids.length?[]:ids);
  return <Context.Provider value={{ids,users,selected,toggle,canEdit}}>{children}</Context.Provider>;
}
export function ContractAMCheckbox({id,label}:{id?:string;label?:string}){
  const state=useContext(Context),ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(ref.current)ref.current.indeterminate=!id&&Boolean(state?.selected.length)&&state?.selected.length!==state?.ids.length;},[id,state]);
  if(!state?.canEdit)return null;
  return <input ref={ref} type="checkbox" className="h-4 w-4 accent-brand-600" aria-label={id?`选择合同 ${label??id}`:"全选当前筛选结果中的合同"} checked={id?state.selected.includes(id):Boolean(state.ids.length)&&state.selected.length===state.ids.length} onChange={()=>state.toggle(id)}/>;
}
export function ContractAMBulkActions(){
  const state=useContext(Context),[open,setOpen]=useState(false),menu=useRef<HTMLDetailsElement>(null);
  if(!state?.canEdit)return null;
  return <><details ref={menu} className="relative"><summary aria-disabled={!state.selected.length} className={`btn-secondary list-none text-sm ${state.selected.length?"cursor-pointer":"cursor-not-allowed opacity-50"}`} onClick={e=>{if(!state.selected.length)e.preventDefault();}}>批量操作{state.selected.length?`（${state.selected.length}）`:""} ▾</summary><div className="absolute right-0 z-20 mt-1 min-w-40 rounded-md border border-slate-200 bg-white p-1"><button type="button" className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={()=>{if(menu.current)menu.current.open=false;setOpen(true);}}>批量设置 AM</button></div></details>{open&&<ContractAMEditor bulk open onClose={()=>setOpen(false)} contracts={state.selected.map(id=>({id,label:id}))} users={state.users}/>}</>;
}
