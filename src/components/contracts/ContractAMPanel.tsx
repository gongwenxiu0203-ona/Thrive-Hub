import { prisma } from "@/lib/prisma";
import { requireSession, adminHasFeature } from "@/lib/session";
import { ContractAMEditor } from "./ContractAMEditor";
export async function ContractAMPanel({contractId}:{contractId:string}){
  const session=await requireSession();if(!["ADMIN","USER"].includes(session.role))return null;
  const assigned=await prisma.contractAMAssignment.findMany({where:{contractId},include:{user:{select:{id:true,name:true,email:true,status:true}}}});
  const canEdit=await adminHasFeature(session,"contracts.records","EDIT");
  const users=canEdit?await prisma.user.findMany({where:{status:"APPROVED"},select:{id:true,name:true,email:true,role:true},orderBy:{name:"asc"}}):[];
  return <section className="space-y-2"><p className="text-sm"><strong>已分配AM：</strong>{assigned.map(a=>`${a.user.name||a.user.email}${a.user.status!=="APPROVED"?"（未启用）":""}`).join("、")||"未分配"}</p>{canEdit&&<ContractAMEditor key={assigned.map(a=>a.userId).sort().join(",")} contracts={[{id:contractId,label:"当前合同"}]} initialIds={assigned.filter(a=>a.user.status==="APPROVED").map(a=>a.userId)} users={users.map(u=>({id:u.id,label:`${u.name} · ${u.email}${["ADMIN","USER"].includes(u.role)?"":"（仅站内信）"}`}))}/>}</section>;
}
