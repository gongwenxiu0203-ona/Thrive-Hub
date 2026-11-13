import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import {randomUUID} from 'node:crypto';
async function main(){
  const dir=path.resolve('backups/finance-am-workflow-20261112-01');const target=path.join(dir,`void-actions-${randomUUID()}.db`);
  assert.equal(path.dirname(target),dir);assert.ok(!fs.existsSync(target));fs.copyFileSync(path.join(dir,'engine.db'),target,fs.constants.COPYFILE_EXCL);
  process.env.DATABASE_URL='file:'+target.replaceAll('\\','/');process.env.FEISHU_NOTIFY_ENABLED='false';
  let actorId='';const loader=Module as unknown as {_load:(name:string,...args:unknown[])=>unknown};const original=loader._load;
  loader._load=function(name,...args){
    if(name==='next/cache')return {revalidatePath:()=>{}};
    if(name==='@/lib/session')return {requireSession:async()=>({userId:actorId,role:'ADMIN'}),getSession:async()=>({userId:actorId,role:'ADMIN'})};
    const value=original.call(this,name,...args);
    if(name==='@/lib/permissionGuard')return {...value as object,requireFeaturePermission:async()=> 'MANAGE'};
    return value;
  };
  const {prisma:db}=await import('../src/lib/prisma');
  try{
    const {setInvoiceStatus,softDeleteInvoice}=await import('../src/actions/invoices');const {deleteBillingRequest}=await import('../src/actions/billingRequests');
    const tag=randomUUID();const actor=await db.user.create({data:{name:'Fictional void tester',email:`void-${tag}@example.invalid`,role:'ADMIN',passwordHash:'not-login'}});actorId=actor.id;
    const customer=await db.customer.create({data:{brandName:'Fictional lifecycle '+tag}});
    for(const received of [0,1]){
      const no=`VOID-ACTION-${randomUUID()}`;
      const request=await db.billingRequest.create({data:{requestNo:no,applicantId:actor.id,customerId:customer.id,legalEntityKey:'Fictional',documentType:'INVOICE',mergeMode:'MERGED',currency:'USD',requestedAmount:100,sourceType:'MANUAL',status:'COMPLETED'}});
      const ar=await db.accountsReceivable.create({data:{invoiceNo:no,customerId:customer.id,invoiceDate:new Date(),dueDate:new Date(),invoiceAmount:100,receivedAmount:received}});
      const inv=await db.invoice.create({data:{invoiceNo:no,billingRequestId:request.id,accountsReceivableId:ar.id,invoiceDate:new Date(),dueDate:new Date(),periodType:'MONTH',periodLabel:'2026-11',feeType:'MONTHLY_FEE',clientName:'Fictional',currency:'USD',totalAmount:100,status:'ISSUED'}});
      await db.financeApprovalStep.create({data:{entityType:'BILLING_REQUEST',entityId:request.id,stepNo:2,stepType:'FINANCE_PROCESSING',status:'APPROVED'}});
      assert.equal((await deleteBillingRequest(request.id,'Fixture deletion')).ok,false,'Issued invoice must block request deletion');
      const result=await setInvoiceStatus(inv.id,'VOID');
      if(received){assert.equal(result.ok,false);assert.equal((await db.invoice.findUniqueOrThrow({where:{id:inv.id}})).status,'ISSUED');continue;}
      assert.equal(result.ok,true,JSON.stringify(result));
      assert.equal((await db.accountsReceivable.findUniqueOrThrow({where:{id:ar.id}})).status,'CANCELLED');
      assert.equal((await db.billingRequest.findUniqueOrThrow({where:{id:request.id}})).status,'PROCESSING');
      assert.equal((await db.financeApprovalStep.findFirstOrThrow({where:{entityId:request.id,stepNo:2}})).status,'PENDING');
      assert.equal((await deleteBillingRequest(request.id,'Fixture deletion')).ok,true);
      assert.equal((await softDeleteInvoice(inv.id)).ok,true);
      assert.ok((await db.invoice.findUniqueOrThrow({where:{id:inv.id}})).deletedAt);
      assert.equal((await db.accountsReceivable.findUniqueOrThrow({where:{id:ar.id}})).invoiceAmount,100);
      assert.ok(await db.financeAuditLog.count({where:{entityId:inv.id}})>=2);
    }
    const requestNo='DOMESTIC-REISSUE-'+randomUUID();
    const request=await db.billingRequest.create({data:{requestNo,applicantId:actor.id,customerId:customer.id,legalEntityKey:'Fictional',documentType:'DOMESTIC',mergeMode:'MERGED',currency:'CNY',requestedAmount:101,sourceType:'MANUAL',status:'PROCESSING',manualItems:{create:{description:'Fictional service',feeType:'MONTHLY_FEE',currency:'CNY',periodType:'MONTH',periodLabel:'2026-11',quantity:1,unitPrice:100,amount:101,netAmount:100,taxRate:.01,taxAmount:1,grossAmount:101}}}});
    await db.invoice.create({data:{invoiceNo:'CN-'+requestNo,billingRequestId:request.id,documentType:'DOMESTIC',invoiceDate:new Date(),dueDate:new Date(),periodType:'MONTH',periodLabel:'2026-11',feeType:'MONTHLY_FEE',clientName:'Fictional old void',currency:'CNY',totalAmount:101,status:'VOID'}});
    const {POST}=await import('../src/app/api/finance/billing/[id]/domestic/route');
    const {PDFDocument,StandardFonts}=await import('pdf-lib');
    const document=await PDFDocument.create();
    document.addPage().drawText('Fictional domestic reissue fixture',{font:await document.embedFont(StandardFonts.Helvetica),size:12});
    const pdf=await document.save();
    const body=new FormData();body.set('file',new Blob([new Uint8Array(pdf)],{type:'application/pdf'}),'fictional-reissue.pdf');
    for(const [key,value] of Object.entries({invoiceNumber:'12345678',invoiceType:'VAT_ORDINARY',invoiceDate:'2026-11-13',taxInclusiveAmount:'101',netAmount:'100',taxAmount:'1',taxRate:'1'}))body.set(key,value);
    const response=await POST(new Request('http://localhost/fixture',{method:'POST',body}),{params:Promise.resolve({id:request.id})});
    const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));
    assert.equal((await db.invoice.findUniqueOrThrow({where:{id:result.invoiceId}})).invoiceNo,'CN-'+requestNo+'-R2');
    console.log('PASS: real SQLite void/delete/AR/audit chain, receipt guard rollback and domestic reissue after VOID without number collision. Framework identity/permissions mocked; fictional isolated data and PDF only.');
  }finally{loader._load=original;await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
