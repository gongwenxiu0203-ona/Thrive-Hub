"use server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireFeaturePermission } from "@/lib/permissionGuard";
import { contractScope } from "@/lib/dataScope";
import { revalidatePath } from "next/cache";

export async function assignContractAM(contractIds:string[], userIds:string[], mode:"APPEND"|"REPLACE"|"CLEAR") {
  try {
    const session=await requireSession();
    if(!["ADMIN","USER"].includes(session.role))throw new Error("仅内部合同管理人员可以分配AM。");
    await requireFeaturePermission(session,"contracts.records","EDIT");
    if(!["APPEND","REPLACE","CLEAR"].includes(mode))throw new Error("分配方式无效。");
    const ids=[...new Set(contractIds)], users=[...new Set(userIds)];
    if(!ids.length||ids.length>200)throw new Error("请选择1至200份合同。");
    if(mode!=="CLEAR"&&!users.length)throw new Error("请选择至少一个AM账号。");
    await prisma.$transaction(async tx=>{
      const actor=await tx.user.findUnique({where:{id:session.userId},select:{status:true,role:true}});
      if(actor?.status!=="APPROVED"||!["ADMIN","USER"].includes(actor.role))throw new Error("账号未启用。");
      const rows=await tx.contract.findMany({where:{AND:[{id:{in:ids},deletedAt:null},contractScope(session,"all")]},select:{id:true}});
      if(rows.length!==ids.length)throw new Error("部分合同不存在或无权修改，未保存任何变更。");
      if(mode!=="CLEAR"&&(await tx.user.count({where:{id:{in:users},status:"APPROVED"}}))!==users.length)throw new Error("所选AM包含未启用账号。");
      for(const id of ids){
        if(mode!=="APPEND")await tx.contractAMAssignment.deleteMany({where:{contractId:id}});
        if(mode!=="CLEAR")for(const userId of users)await tx.contractAMAssignment.upsert({where:{contractId_userId:{contractId:id,userId}},update:{},create:{contractId:id,userId,assignedById:session.userId}});
        await tx.financeAuditLog.create({data:{entityType:"CONTRACT",entityId:id,action:"ASSIGN_AM",actorId:session.userId,note:`AM分配：${mode}`,metadata:JSON.stringify({mode,userIds:mode==="CLEAR"?[]:users})}});
      }
    });
    revalidatePath("/contracts");for(const id of ids)revalidatePath(`/contracts/${id}`);
    return {ok:true};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:"AM分配失败"};}
}
