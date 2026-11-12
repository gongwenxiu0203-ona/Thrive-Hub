import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import {randomUUID} from 'node:crypto';

// Only identity/feature/framework boundaries are stubbed. All actions, guards on
// owner/state/facts, attachment linking and transactions use real Prisma/SQLite.
async function main(){
  const directory=path.resolve('backups/finance-am-workflow-20261112-01');
  const target=path.join(directory,`resubmit-review-${randomUUID()}.db`);
  assert.equal(path.dirname(target),directory);assert.ok(!fs.existsSync(target));
  fs.copyFileSync(path.join(directory,'engine.db'),target,fs.constants.COPYFILE_EXCL);
  process.env.DATABASE_URL=`file:${target.replace(/\\/g,'/')}`;process.env.FEISHU_NOTIFY_ENABLED='false';
  let identity={userId:'',role:'USER'};
  const module=Module as unknown as {_load:(name:string,...args:unknown[])=>unknown};
  const original=module._load;
  module._load=function(name,...args){
    if(name==='next/cache')return {revalidatePath:()=>{}};
    if(name==='@/lib/session')return {requireSession:async()=>identity,getSession:async()=>identity};
    if(name==='@/lib/permissionGuard')return {requireFeaturePermission:async()=> 'MANAGE'};
    return original.call(this,name,...args);
  };
  const {prisma:db}=await import('../src/lib/prisma');
  try{
    const actions=await import('../src/actions/financeUnified');
    const edit=await import('../src/actions/financeResubmit');
    const tag=randomUUID();
    const applicant=await db.user.create({data:{name:'Fictional applicant',email:`owner-${tag}@example.invalid`,passwordHash:'not-login'}});
    const reviewer=await db.user.create({data:{name:'Fictional reviewer',email:`review-${tag}@example.invalid`,passwordHash:'not-login'}});
    const customer=await db.customer.create({data:{brandName:`Fictional ${tag}`}});
    const payer=await db.financeAccountProfile.create({data:{profileNo:`ACC-${tag}`,name:'Fictional payer',accountType:'COMPANY_BANK',legalEntity:'Fictional',accountName:'Fictional',accountNumber:'TEST',currency:'USD',createdById:applicant.id}});
    for(const entityType of ['BILLING_REQUEST','PAYMENT_REQUEST','EXPENSE_CLAIM'])await db.financeApprovalPolicy.upsert({where:{entityType},create:{entityType,reviewRequired:true,defaultReviewerId:reviewer.id,updatedById:reviewer.id},update:{reviewRequired:true,defaultReviewerId:reviewer.id,defaultProcessorId:null}});
    const billing={customerId:customer.id,documentType:'INVOICE' as const,items:[{description:'Service',feeType:'MONTHLY_FEE' as const,currency:'USD',periodType:'MONTH' as const,periodLabel:'2026-11',quantity:1,unitPrice:10}]};
    const payment={supplierName:'Fictional supplier',supplierType:'SUPPLIER',accountName:'Fictional',accountNumber:'',payerAccountProfileId:payer.id,reason:'Original reason',currency:'USD',amount:10};
    const expense={reimbursementEntity:'Fictional',currency:'USD',accountName:'Fictional',accountNumber:'TEST',items:[{description:'Original expense',expenseType:'OTHER',expenseDate:'2026-11-12',amount:10}]};
    const cases=[['BILLING_REQUEST',billing,actions.submitManualBillingRequest,edit.resubmitManualBillingRequest],['PAYMENT_REQUEST',payment,actions.createSupplierAndPaymentRequest,edit.resubmitSupplierPaymentRequest],['EXPENSE_CLAIM',expense,actions.createExpenseClaim,edit.resubmitEmployeeExpenseClaim]] as const;
    for(const [kind,input,create,resubmit] of cases){
      identity={userId:applicant.id,role:'USER'};
      const url=`/uploads/fictional-${randomUUID()}.pdf`;
      await db.financeAttachment.create({data:{entityType:kind==='BILLING_REQUEST'?'BILLING_STAGED':kind==='PAYMENT_REQUEST'?'PAYMENT_STAGED':'EXPENSE_STAGED',entityId:applicant.id,uploadedById:applicant.id,attachmentType:'SUPPORTING_DOCUMENT',fileUrl:url}});
      const created=await (create as Function)({...input,attachmentUrls:[url]});assert.equal(created.ok,true,JSON.stringify(created));
      const id=created.id??created.request?.id;assert.ok(id,'Creation must return an ID');
      identity={userId:reviewer.id,role:'USER'};
      assert.equal((await actions.decideFinanceRequest(kind,id,'REJECT','Fictional rejection')).ok,true);
      assert.equal((await edit.getFinanceRequestEditData(kind,id)).ok,false,'Non-owner must not get edit DTO');
      identity={userId:applicant.id,role:'USER'};
      const dto=await edit.getFinanceRequestEditData(kind,id);if(!dto.ok)throw Error(dto.error);
      assert.ok(dto.data.input.attachmentUrls?.includes(url));
      const before=await db.financeRequestRevision.count({where:{entityType:kind,entityId:id}});
      await db.financeApprovalPolicy.update({where:{entityType:kind},data:{reviewRequired:false,version:{increment:1}}});
      const result=await (resubmit as Function)(id,dto.data.input);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.id,id);
      assert.equal((await db.financeRequestRevision.count({where:{entityType:kind,entityId:id}})),before+2);
      const revisions=await db.financeRequestRevision.findMany({where:{entityType:kind,entityId:id},orderBy:{revisionNo:'asc'}});
      assert.equal(JSON.parse(revisions.at(-2)!.snapshot).record.status,'REJECTED');
      assert.equal(JSON.parse(revisions.at(-2)!.stepsSnapshot)[0].status,'REJECTED');
      assert.equal(JSON.parse(revisions.at(-2)!.policySnapshot).reviewRequired,true);
      assert.equal(JSON.parse(revisions.at(-1)!.policySnapshot).reviewRequired,false);
      assert.ok(await db.financeAttachment.count({where:{entityType:kind,entityId:id,fileUrl:url,attachmentType:'REVISION_ARCHIVE'}}));
      assert.ok(await db.financeAttachment.count({where:{entityType:kind,entityId:id,fileUrl:url,attachmentType:{not:'REVISION_ARCHIVE'}}}));
      assert.equal((await (resubmit as Function)(id,dto.data.input)).ok,false,'Repeat submission must reject');
      assert.equal((await db.financeApprovalStep.findFirstOrThrow({where:{entityType:kind,entityId:id,stepNo:1}})).status,'SKIPPED');
      assert.equal((await db.financeApprovalStep.findFirstOrThrow({where:{entityType:kind,entityId:id,stepNo:2}})).status,'PENDING');
      // Restore only this fictional record to a rejected round for a simultaneous
      // claim test. No payment/invoice facts exist on this fixture.
      if(kind==='BILLING_REQUEST')await db.billingRequest.update({where:{id},data:{status:'REJECTED'}});
      else if(kind==='PAYMENT_REQUEST')await db.paymentRequest.update({where:{id},data:{status:'REJECTED'}});
      else await db.expenseClaim.update({where:{id},data:{status:'REJECTED'}});
      identity={userId:reviewer.id,role:'USER'};
      assert.equal((await (resubmit as Function)(id,dto.data.input)).ok,false,'Non-owner must not resubmit');
      identity={userId:applicant.id,role:'USER'};
      const concurrentBefore=await db.financeRequestRevision.count({where:{entityType:kind,entityId:id}});
      const races=await Promise.all([(resubmit as Function)(id,dto.data.input),(resubmit as Function)(id,dto.data.input)]);
      assert.equal(races.filter(r=>r.ok).length,1,JSON.stringify(races));
      assert.equal(await db.financeRequestRevision.count({where:{entityType:kind,entityId:id}}),concurrentBefore+2,'Losing transaction must not archive an extra revision');
      // An anomalous REJECTED record with payment facts must stay locked.
      if(kind!=='BILLING_REQUEST'){
        if(kind==='PAYMENT_REQUEST')await db.paymentRequest.update({where:{id},data:{status:'REJECTED',paidAt:new Date()}});
        else await db.expenseClaim.update({where:{id},data:{status:'REJECTED',paidAt:new Date()}});
        assert.equal((await edit.getFinanceRequestEditData(kind,id)).ok,false);
        assert.equal((await (resubmit as Function)(id,dto.data.input)).ok,false);
      }
      console.log(`PASS ${kind}: create/reject/owner DTO/same-ID resubmit/new policy/revisions/attachment references/repeat/fact locks`);
    }
    assert.equal((await db.$queryRawUnsafe<Array<{integrity_check:string}>>('PRAGMA integrity_check'))[0].integrity_check,'ok');
    assert.equal((await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check')).length,0);
    console.log(`PASS integrity/FK; retained ${target}. No physical file or external-send test.`);
  }finally{await db.$disconnect();module._load=original;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
