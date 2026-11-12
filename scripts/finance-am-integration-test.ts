import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

async function main() {
  const root=path.resolve('backups/finance-am-workflow-20261112-01');
  const source=path.join(root,'engine.db');
  const target=path.join(root,`review-${randomUUID()}.db`);
  assert.equal(path.dirname(target),root);
  assert.ok(!fs.existsSync(target));
  fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  process.env.DATABASE_URL=`file:${target.replace(/\\/g,'/')}`;
  process.env.FEISHU_NOTIFY_ENABLED='false';
  const {prisma:db}=await import('../src/lib/prisma');
  const {runContractAMReminders}=await import('../src/lib/contractAMReminderAutomation');
  const {createTwoStageFinanceApproval}=await import('../src/lib/financeApproval');
  const {captureFinanceRevision}=await import('../src/lib/financeRequestHistory');
  try {
    assert.equal(await db.contractAMAssignment.count(),0,'Source must have no real AM assignments');
    const tag=randomUUID();
    const user=await db.user.create({data:{name:'Fictional review AM',email:`am-${tag}@example.invalid`,passwordHash:'not-a-valid-login-hash'}});
    const customer=await db.customer.create({data:{brandName:`Fictional review ${tag}`,status:'COOPERATING'}});
    const contract=await db.contract.create({data:{contractNo:`TEST-${tag}`,customerId:customer.id,type:'BRAND',status:'COMPLETED',createdById:user.id}});
    const assignment=await db.contractAMAssignment.create({data:{contractId:contract.id,userId:user.id,assignedById:user.id}});
    const due=new Date('2026-12-05T01:00:00Z');
    assert.equal((await runContractAMReminders(new Date('2026-12-05T00:59:00Z'))).created,0);
    assert.equal((await runContractAMReminders(due)).created,1);
    assert.equal((await runContractAMReminders(due)).created,0);
    await db.contractAMAssignment.delete({where:{id:assignment.id}});
    assert.equal((await runContractAMReminders(new Date('2027-01-05T01:00:00Z'))).created,0);
    await db.contractAMAssignment.create({data:{contractId:contract.id,userId:user.id,assignedById:user.id}});
    await db.contract.update({where:{id:contract.id},data:{status:'SIGNING'}});
    assert.equal((await runContractAMReminders(new Date('2027-01-05T01:00:00Z'))).created,0);
    await db.contract.update({where:{id:contract.id},data:{status:'COMPLETED'}});
    await db.customer.update({where:{id:customer.id},data:{status:'COOPERATION_DONE'}});
    assert.equal((await runContractAMReminders(new Date('2027-01-05T01:00:00Z'))).created,0);
    const payment=await db.paymentRequest.create({data:{requestNo:`PAY-${tag}`,applicantId:user.id,payerEntity:'Fictional',reason:'Isolation test',currency:'USD',amount:1}});
    await db.financeApprovalPolicy.upsert({where:{entityType:'PAYMENT_REQUEST'},update:{reviewRequired:false,defaultProcessorId:null},create:{entityType:'PAYMENT_REQUEST',reviewRequired:false,updatedById:user.id}});
    await db.$transaction(async tx=>{await createTwoStageFinanceApproval(tx,'PAYMENT_REQUEST',payment.id);await captureFinanceRevision(tx,'PAYMENT_REQUEST',payment.id,user.id);});
    const saved=await db.paymentRequest.findUniqueOrThrow({where:{id:payment.id}});
    assert.equal(saved.status,'APPROVED');assert.equal(saved.paidAt,null);assert.equal(saved.paymentProofUrls,'[]');
    const steps=await db.financeApprovalStep.findMany({where:{entityId:payment.id},orderBy:{stepNo:'asc'}});
    assert.equal(steps[0].status,'SKIPPED');assert.equal(steps[1].status,'PENDING');
    const revision=await db.financeRequestRevision.findFirstOrThrow({where:{entityId:payment.id}});
    await db.paymentRequest.update({where:{id:payment.id},data:{reason:'Edited later'}});
    assert.equal(JSON.parse(revision.snapshot).record.reason,'Isolation test');
    assert.equal(JSON.parse(revision.policySnapshot).reviewRequired,false);
    assert.equal((await db.$queryRawUnsafe<Array<{integrity_check:string}>>('PRAGMA integrity_check'))[0].integrity_check,'ok');
    assert.equal((await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check')).length,0);
    console.log('PASS: isolated AM fifth-day/retry/removal/unsigned/ended; skip preserves financial facts; immutable revision snapshot; integrity/FK. No external sends.');
    console.log(`Retained isolated fixture: ${target}`);
  } finally {await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
