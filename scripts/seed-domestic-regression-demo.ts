// Explicit fictional UI fixtures, never production or an existing business database.
import assert from "node:assert/strict";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const expected=path.resolve("backups/finance-domestic-20261112-01/ui.db").replaceAll("\\","/");
assert.equal(process.env.DATABASE_URL?.replaceAll("\\","/"),"file:"+expected,"Only the explicit isolated UI database is permitted");
const db=new PrismaClient();
const password="LocalDemo-Only-20261112!";
async function main() {
  const operatorId="TEST-DOMESTIC-OPERATOR-20261112";
  assert.equal(await db.user.count({where:{id:operatorId}}),0,"Refusing to overwrite a prior fixture run");
  const passwordHash=await bcrypt.hash(password,10);
  const result=await db.$transaction(async tx=>{
    const operator=await tx.user.create({data:{id:operatorId,name:"TEST-开票操作员",email:"domestic-operator@example.invalid",passwordHash,role:"ADMIN",status:"APPROVED"}});
    const applicant=await tx.user.create({data:{id:"TEST-DOMESTIC-APPLICANT-20261112",name:"TEST-申请人",email:"domestic-applicant@example.invalid",passwordHash,role:"USER",status:"APPROVED"}});
    const contractUser=await tx.user.create({data:{id:"TEST-CONTRACT-UPLOADER-20261112",name:"TEST-无财务授权合同员工",email:"contract-uploader@example.invalid",passwordHash,role:"USER",status:"APPROVED",permissionOverrides:{create:[{feature:"contracts.records",level:"EDIT"},{feature:"finance.channel_split_rules",level:"NONE"}]}}});
    const customer=await tx.customer.create({data:{id:"TEST-DOMESTIC-CUSTOMER-20261112",brandName:"TEST-国内发票验收虚构品牌",status:"COOPERATING",businessOwnerId:applicant.id,createdById:applicant.id}});
    const profile=await tx.customerBillingProfile.create({data:{id:"TEST-DOMESTIC-PROFILE-20261112",customerId:customer.id,name:"TEST-虚构开票资料",invoiceTitle:"TEST-虚构客户有限公司（仅本地验收）",taxNumber:"TEST-TAX-913100000000000000",registeredAddress:"TEST-虚构路1号",registeredPhone:"000-00000000",deliveryEmail:"billing@example.invalid",isDefault:true,status:"ACTIVE"}});
    const request=await tx.billingRequest.create({data:{id:"TEST-DOMESTIC-REQUEST-20261112",requestNo:"TEST-BR-DOMESTIC-20261112",applicantId:applicant.id,acceptedById:operator.id,customerId:customer.id,legalEntityKey:customer.brandName,documentType:"DOMESTIC",mergeMode:"MERGED",currency:"CNY",requestedAmount:18623.39,sourceType:"MANUAL",status:"PROCESSING",acceptedAt:new Date(),applicantNote:`开票资料:${profile.id};发票类型:NORMAL`,manualItems:{create:[{description:"月度服务费",feeType:"MONTHLY_FEE",currency:"CNY",periodType:"MONTH",periodLabel:"2025-11",serviceMonths:JSON.stringify(["2025-11"]),quantity:1,unitPrice:6685,amount:6751.85,netAmount:6685,taxRate:.01,taxAmount:66.85,grossAmount:6751.85,sortOrder:0},{description:"销售佣金",feeType:"SALES_COMMISSION",currency:"CNY",periodType:"MONTH",periodLabel:"2026-09",serviceMonths:JSON.stringify(["2026-09"]),quantity:1,unitPrice:11754,amount:11871.54,netAmount:11754,taxRate:.01,taxAmount:117.54,grossAmount:11871.54,sortOrder:1}]}}});
    await tx.financeApprovalStep.createMany({data:[{entityType:"BILLING_REQUEST",entityId:request.id,stepNo:1,stepType:"SHALLOW_REVIEW",assigneeId:operator.id,operatorId:operator.id,status:"APPROVED",actedAt:new Date()},{entityType:"BILLING_REQUEST",entityId:request.id,stepNo:2,stepType:"FINANCE_PROCESSING",status:"PENDING"}]});
    return {operator:operator.email,applicant:applicant.email,contractUploader:contractUser.email,requestId:request.id};
  });
  console.log(JSON.stringify({testOnly:true,password,...result},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
