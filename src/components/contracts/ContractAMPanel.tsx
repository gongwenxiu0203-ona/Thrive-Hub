import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireSession,adminHasFeature } from "@/lib/session";
import { ContractAMEditor } from "./ContractAMEditor";
const loadAM=cache(async(contractId:string)=>{
  const session=await requireSession();if(!["ADMIN","USER"].includes(session.role))return null;
  const assigned=await prisma.contractAMAssignment.findMany({where:{contractId},include:{user:{select:{id:true,name:true,email:true,status:true}},assignedBy:{select:{name:true,email:true}}},orderBy:{createdAt:"asc"}});
  const canEdit=await adminHasFeature(session,"contracts.records","EDIT");
  const users=canEdit?await prisma.user.findMany({where:{status:"APPROVED"},select:{id:true,name:true,email:true,role:true},orderBy:{name:"asc"}}):[];
  return {assigned,canEdit,users};
});
export async function ContractAMPanel({contractId,variant="info"}:{contractId:string;variant?:"info"|"button"}){
  const data=await loadAM(contractId);if(!data)return null;
  if(variant==="button")return data.canEdit?<ContractAMEditor key={data.assigned.map(row=>row.id).join(",")} contracts={[{id:contractId,label:"当前合同"}]} initialIds={data.assigned.map(row=>row.userId)} users={[...data.users.map(user=>({id:user.id,label:`${user.name} · ${user.email}${["ADMIN","USER"].includes(user.role)?"":"（仅站内信）"}`})),...data.assigned.filter(row=>row.user.status!=="APPROVED").map(row=>({id:row.userId,label:`${row.user.name} · ${row.user.email}（未启用，请取消选择）`}))]}/>:null;
  return <div className="mt-2 space-y-1 text-sm"><span className="font-medium text-slate-700">AM：</span>{!data.assigned.length?<span className="text-slate-600">未分配</span>:data.assigned.map(row=><div key={row.id} className="mt-1"><p className="break-words text-slate-800">{row.user.name} · {row.user.email}{row.user.status!=="APPROVED"?"（未启用）":""}</p><p className="mt-0.5 break-words text-xs text-slate-500">设置时间：{row.createdAt.toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}　操作账号：{row.assignedBy.name} · {row.assignedBy.email}</p></div>)}</div>;
}
