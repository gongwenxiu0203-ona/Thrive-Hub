import assert from 'node:assert/strict';
import type {Prisma} from '@prisma/client';
import {createTwoStageFinanceApproval} from '../src/lib/financeApproval';

function fixture(reviewRequired:boolean,reviewerId='reviewer',ownerId='applicant',ownerRole='USER'){
  const steps:any[]=[];const updates:any[]=[];
  const tx={
    financeApprovalPolicy:{findUnique:async()=>({reviewRequired,defaultReviewerId:reviewerId,defaultProcessorId:null})},
    user:{findFirst:async({where}:any)=>({id:where.id??'fallback',name:'Reviewer',email:'reviewer@example.invalid'}),findUnique:async()=>({role:ownerRole})},
    billingRequest:{findUnique:async()=>({applicantId:ownerId})},
    paymentRequest:{findUnique:async()=>({applicantId:ownerId}),update:async(v:any)=>updates.push(v)},
    expenseClaim:{findUnique:async()=>({employeeId:ownerId}),update:async(v:any)=>updates.push(v)},
    financeApprovalStep:{createMany:async({data}:any)=>steps.push(...data)},
  } as unknown as Prisma.TransactionClient;
  return {tx,steps,updates};
}
async function main(){
  for(const kind of ['BILLING_REQUEST','PAYMENT_REQUEST','EXPENSE_CLAIM'] as const){
    const f=fixture(false);const result=await createTwoStageFinanceApproval(f.tx,kind,'fictional');
    assert.equal(result.reviewRequired,false);assert.equal(f.steps[0].status,'SKIPPED');assert.equal(f.steps[1].status,'PENDING');
    assert.ok(f.updates.every(x=>x.data.status==='APPROVED'),'Skipping review must never create a payment/invoice fact');
    if(kind==='BILLING_REQUEST')assert.equal(f.updates.length,0);
  }
  const required=fixture(true);const selected=await createTwoStageFinanceApproval(required.tx,'PAYMENT_REQUEST','fictional');
  assert.equal(selected.id,'reviewer');assert.equal(required.steps[0].status,'PENDING');assert.equal(required.updates.length,0);
  const own=fixture(true,'applicant');await assert.rejects(createTwoStageFinanceApproval(own.tx,'PAYMENT_REQUEST','fictional'),/非管理员/);
  const admin=fixture(true,'applicant','applicant','ADMIN');assert.equal((await createTwoStageFinanceApproval(admin.tx,'PAYMENT_REQUEST','fictional')).id,'applicant');
  console.log('PASS: policy defaults, required/skip stages and self-review guard; mocked transactions only, no DB writes.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
