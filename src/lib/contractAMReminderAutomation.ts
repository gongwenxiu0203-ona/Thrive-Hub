import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { contractAMClock } from "./contractAMReminderRules";
export async function runContractAMReminders(now=new Date()){
  const clock=contractAMClock(now);if(!clock.due)return {created:0,skipped:0,notDue:true};
  const dayStart=new Date(`${clock.date}T00:00:00+08:00`),dayEnd=new Date(`${clock.date}T23:59:59.999+08:00`);
  const eligible={status:"COMPLETED",deletedAt:null,customer:{is:{deletedAt:null,status:{notIn:["TERMINATED","COOPERATION_DONE"]}}},AND:[{OR:[{startDate:null},{startDate:{lte:dayEnd}}]},{OR:[{endDate:null},{endDate:{gte:dayStart}}]}]};
  const assignments=await prisma.contractAMAssignment.findMany({where:{contract:eligible,user:{status:"APPROVED"}},select:{id:true}});
  let created=0,skipped=0;
  for(const item of assignments){
    try{
      const sent=await prisma.$transaction(async tx=>{
        const assignment=await tx.contractAMAssignment.findFirst({where:{id:item.id,contract:eligible,user:{status:"APPROVED"}},include:{contract:{include:{customer:{select:{brandName:true}}}}}});
        if(!assignment)return false;
        const key={contractId:assignment.contractId,targetUserId:assignment.userId,yearMonth:clock.yearMonth};
        if(await tx.contractAMMonthlyDispatch.findUnique({where:{contractId_targetUserId_yearMonth:key}}))return false;
        const reminder=await tx.reminder.create({data:{targetId:assignment.userId,createdById:assignment.assignedById,title:`请确认客户付款情况：${assignment.contract.customer?.brandName||assignment.contract.contractNo}`,content:`${clock.yearMonth} AM月度提醒：请核实客户付款情况并跟进未到账款项，同时请及时提交开票申请。合同：${assignment.contract.contractNo}\n[[href:/contracts/${assignment.contractId}]]`,type:"AM_PAYMENT_CHECK",remindDate:now}});
        await tx.contractAMMonthlyDispatch.create({data:{...key,reminderId:reminder.id}});return true;
      });
      if(sent)created++;else skipped++;
    }catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")skipped++;else throw error;}
  }
  return {created,skipped,notDue:false};
}
