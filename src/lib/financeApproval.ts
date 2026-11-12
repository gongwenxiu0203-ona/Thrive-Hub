import type { Prisma } from "@prisma/client";

export const SHALLOW_FINANCE_EMAIL = "shallow.w@thraiveagency.com";

export async function resolveFinancePoliciesForDisplay(tx:Prisma.TransactionClient){
  const rows=await tx.financeApprovalPolicy.findMany();
  const fallback=await tx.user.findFirst({where:{email:SHALLOW_FINANCE_EMAIL,status:'APPROVED',role:{in:['ADMIN','USER']}},select:{id:true}});
  return Object.fromEntries(['BILLING_REQUEST','PAYMENT_REQUEST','EXPENSE_CLAIM'].map(entityType=>{
    const row=rows.find(r=>r.entityType===entityType);
    return [entityType,{reviewRequired:row?.reviewRequired??true,defaultReviewerId:row?.defaultReviewerId??fallback?.id??null,defaultProcessorId:row?.defaultProcessorId??null}];
  }));
}

export async function requireShallowFinanceReviewer(tx: Prisma.TransactionClient) {
  const reviewer = await tx.user.findFirst({
    where: {
      status: "APPROVED",
      email: SHALLOW_FINANCE_EMAIL,
      role: { in: ["ADMIN", "USER"] },
    },
    orderBy: { email: "asc" },
    select: { id: true, name: true, email: true },
  });
  if (!reviewer) {
    throw new Error(`未找到已启用的财务初审人 ${SHALLOW_FINANCE_EMAIL}，申请未提交。请管理员先创建或启用该账号。`);
  }
  return reviewer;
}

export async function createTwoStageFinanceApproval(
  tx: Prisma.TransactionClient,
  entityType: "BILLING_REQUEST" | "PAYMENT_REQUEST" | "EXPENSE_CLAIM",
  entityId: string,
  reviewerId?: string,
) {
  const policy = await tx.financeApprovalPolicy.findUnique({where:{entityType}});
  const required = policy?.reviewRequired ?? true;
  const selectedId = reviewerId || policy?.defaultReviewerId || undefined;
  const shallow = required ? selectedId
    ? await tx.user.findFirst({
        where: { id: selectedId, status: "APPROVED", role: { in: ["ADMIN", "USER"] } },
        select: { id: true, name: true, email: true },
      })
    : await requireShallowFinanceReviewer(tx) : null;
  if (required && !shallow) throw new Error("所选审核人不存在、未启用或不是内部账号。");
  const owner=entityType==='BILLING_REQUEST'?await tx.billingRequest.findUnique({where:{id:entityId},select:{applicantId:true}}):entityType==='PAYMENT_REQUEST'?await tx.paymentRequest.findUnique({where:{id:entityId},select:{applicantId:true}}):await tx.expenseClaim.findUnique({where:{id:entityId},select:{employeeId:true}}).then(r=>r?{applicantId:r.employeeId}:null);
  if(owner?.applicantId===shallow?.id){
    const applicant=await tx.user.findUnique({where:{id:shallow!.id},select:{role:true}});
    if(applicant?.role!=='ADMIN')throw new Error('非管理员申请人不能选择自己作为审核人。');
  }
  if(policy?.defaultProcessorId && !await tx.user.findFirst({where:{id:policy.defaultProcessorId,status:'APPROVED',role:{in:['ADMIN','USER']}},select:{id:true}}))throw new Error('默认财务经办人已失效，请管理员更新审核设置。');
  await tx.financeApprovalStep.createMany({
    data: [
      { entityType, entityId, stepNo: 1, stepType: "SHALLOW_REVIEW", assigneeId: shallow?.id, status: required ? "PENDING" : "SKIPPED", comment:required?null:'按提交时管理员配置免审核',actedAt:required?null:new Date() },
      { entityType, entityId, stepNo: 2, stepType: "FINANCE_PROCESSING", assigneeId:policy?.defaultProcessorId, status: "PENDING", comment: required?`等待 ${shallow?.name || shallow?.email} 初审通过`:'免审批；仍须财务实际开票或付款核销' },
    ],
  });
  if(!required && entityType==='PAYMENT_REQUEST')await tx.paymentRequest.update({where:{id:entityId},data:{status:'APPROVED'}});
  if(!required && entityType==='EXPENSE_CLAIM')await tx.expenseClaim.update({where:{id:entityId},data:{status:'APPROVED'}});
  return shallow ? {...shallow,reviewRequired:true} : {id:'',name:'',email:'',reviewRequired:false};
}

export function normalizeFinanceUrls(value: string | string[] | null | undefined): string[] {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[,\n]/);
  return [...new Set(values.map((item) => item.trim()).filter((item) => item.startsWith("/uploads/") || /^https:\/\//i.test(item)))].slice(0, 50);
}
