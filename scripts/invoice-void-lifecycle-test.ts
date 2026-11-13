import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
async function main(){
  const dir=path.resolve('backups/finance-am-workflow-20261112-01');
  const target=path.join(dir,`void-${randomUUID()}.db`);
  assert.equal(path.dirname(target),dir);assert.ok(!fs.existsSync(target));
  fs.copyFileSync(path.join(dir,'engine.db'),target,fs.constants.COPYFILE_EXCL);
  process.env.DATABASE_URL='file:'+target.replaceAll('\\','/');process.env.FEISHU_NOTIFY_ENABLED='false';
  const {prisma:db}=await import('../src/lib/prisma');
  const {retireUnpaidInvoiceReceivable}=await import('../src/lib/invoiceVoidLifecycle');
  try{
    for(const received of [0,1]){
      const invoiceNo='VOID-FIXTURE-'+randomUUID();
      const ar=await db.accountsReceivable.create({data:{invoiceNo,invoiceDate:new Date(),dueDate:new Date(),invoiceAmount:100,receivedAmount:received}});
      const inv=await db.invoice.create({data:{invoiceNo,accountsReceivableId:ar.id,invoiceDate:new Date(),dueDate:new Date(),periodType:'MONTH',periodLabel:'2026-11',feeType:'MONTHLY_FEE',clientName:'Fictional void fixture',totalAmount:100,status:'VOID'}});
      if(received)await assert.rejects(db.$transaction(tx=>retireUnpaidInvoiceReceivable(tx,inv.id)),/到账或核销/);
      else {await db.$transaction(tx=>retireUnpaidInvoiceReceivable(tx,inv.id));assert.equal((await db.accountsReceivable.findUniqueOrThrow({where:{id:ar.id}})).status,'CANCELLED');}
      assert.equal((await db.accountsReceivable.findUniqueOrThrow({where:{id:ar.id}})).invoiceAmount,100,'History amount must be preserved');
      if(!received){
        await db.invoice.create({data:{invoiceNo:invoiceNo+'-other',accountsReceivableId:ar.id,invoiceDate:new Date(),dueDate:new Date(),periodType:'MONTH',periodLabel:'2026-11',feeType:'MONTHLY_FEE',clientName:'Fictional shared AR',totalAmount:100,status:'ISSUED'}});
        await assert.rejects(db.$transaction(tx=>retireUnpaidInvoiceReceivable(tx,inv.id)),/其他有效票据/);
      }
    }
    assert.ok(fs.readFileSync('src/lib/contractAMReminderAutomation.ts','utf8').includes('及时提交开票申请'));
    console.log('PASS: unpaid AR retirement, receipt/shared-invoice guards and history preservation; AM copy. Isolated fictional DB only.');
  }finally{await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
