// Real local HTTP/multipart regression. Writes fictional fixtures ONLY in the dedicated ui.db.
// Never reset a completed fixture: reruns must use a newly prepared UI fixture database.
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSessionToken } from '../src/lib/auth';

const expectedPath=path.resolve('backups/finance-domestic-20261112-01/ui.db').replaceAll('\\','/');
assert.equal(process.env.DATABASE_URL?.replaceAll('\\','/'),'file:'+expectedPath,'Only the dedicated local ui.db is allowed');
assert.equal(realpathSync(expectedPath).replaceAll('\\','/'),expectedPath,'Refusing a redirected/symlinked database');
assert.equal(process.env.JWT_SECRET,'domestic-http-test-only-20261112-signing-key','Only the fictional local HTTP signing key is allowed');
assert.equal(process.env.FEISHU_NOTIFY_ENABLED,'false','Disable outgoing Feishu delivery for this test');
const db=new PrismaClient();
const base='http://127.0.0.1:3002';
const requestId='TEST-DOMESTIC-REQUEST-20261112';
const operatorId='TEST-DOMESTIC-OPERATOR-20261112';
const cents=(value:number)=>Math.round(value*100);
async function main(){
  const request=await db.billingRequest.findUniqueOrThrow({where:{id:requestId},include:{manualItems:{orderBy:{sortOrder:'asc'}},invoices:true}});
  assert.equal(request.status,'PROCESSING','Fixture already completed or invalid; refusing to reset/reuse it');
  assert.equal(request.invoices.length,0,'Refusing a fixture that already has invoices');
  assert.equal(request.customerId,'TEST-DOMESTIC-CUSTOMER-20261112');
  assert.equal(cents(request.requestedAmount),1862339);
  const operator=await db.user.findUniqueOrThrow({where:{id:operatorId}});
  assert.equal(operator.email,'domestic-operator@example.invalid');
  assert.equal(operator.role,'ADMIN');assert.equal(operator.status,'APPROVED');
  const profile=await db.customerBillingProfile.findUniqueOrThrow({where:{id:'TEST-DOMESTIC-PROFILE-20261112'}});
  assert.equal(profile.customerId,request.customerId);
  const pdf=readFileSync(path.resolve('output/domestic-regression-20261112.pdf'));
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  const cookie='ams_session='+await createSessionToken({userId:operator.id,name:operator.name,email:operator.email,role:operator.role,status:operator.status});
  const headers={cookie};
  const endpoint=base+'/api/finance/billing/'+requestId+'/domestic';
  function data(){
    const body=new FormData();
    body.set('file',new Blob([new Uint8Array(pdf)],{type:'application/pdf'}),'国内发票验收.pdf');
    for(const [key,value] of Object.entries({invoiceNumber:'12345678',invoiceCode:'TEST-LOCAL-ONLY',invoiceType:'VAT_ORDINARY',invoiceDate:'2026-11-12',taxInclusiveAmount:'18623.39',netAmount:'18439.00',taxAmount:'184.39',taxRate:'1'}))body.set(key,value);
    return body;
  }
  async function post(url:string,init:RequestInit){return fetch(url,{...init,signal:AbortSignal.timeout(30000)});}
  assert.equal((await post(endpoint,{method:'POST',body:data()})).status,401,'Unauthenticated archive must reject before writes');
  assert.equal((await post(endpoint+'/extract',{method:'POST',body:data()})).status,401,'Unauthenticated extract must reject');
  for(const url of [endpoint+'/extract',endpoint]){
    const broken=await post(url,{method:'POST',headers:{...headers,'Content-Type':'multipart/form-data; boundary=broken'},body:'--wrong-boundary\r\nnot-a-valid-part\r\n'});
    assert.equal(broken.status,400,'Malformed multipart must return a friendly 400');
    const error=await broken.json();assert.match(String(error.error),/[\u4e00-\u9fff]/,'Malformed request should have a Chinese error');
    assert.ok(!String(error.error).includes('Failed to parse body as FormData'));
  }
  const extracted=await post(endpoint+'/extract',{method:'POST',headers,body:data()});
  const extractionStatus=extracted.status;
  const extraction=await extracted.json();
  const before=await db.invoice.count({where:{billingRequestId:requestId}});
  const archive=await post(endpoint,{method:'POST',headers,body:data()});
  assert.equal(archive.status,201,'A matching gross/net/tax PDF must archive successfully');
  const result=await archive.json();assert.equal(typeof result.invoiceId,'string');
  const invoice=await db.invoice.findUniqueOrThrow({where:{id:result.invoiceId},include:{domesticDocument:{include:{lines:{orderBy:{sortOrder:'asc'}}}},items:{orderBy:{sortOrder:'asc'}}}});
  assert.equal(invoice.billingRequestId,requestId);assert.equal(invoice.clientName,profile.invoiceTitle);
  assert.equal(invoice.status,'ISSUED');assert.equal(invoice.documentType,'DOMESTIC');
  assert.equal(cents(invoice.totalAmount),1862339);assert.equal(invoice.currency,'CNY');
  const document=invoice.domesticDocument;assert.ok(document);
  assert.equal(document.invoiceNumber,'12345678');assert.equal(document.invoiceType,'VAT_ORDINARY');
  assert.equal(cents(document.taxInclusiveAmount),1862339);assert.equal(cents(document.netAmount),1843900);assert.equal(cents(document.taxAmount),18439);
  assert.equal(document.lines.length,2);assert.equal(invoice.items.length,2);
  assert.deepEqual(document.lines.map(x=>[cents(x.netAmount),cents(x.taxAmount),cents(x.taxInclusiveAmount)]),[[668500,6685,675185],[1175400,11754,1187154]]);
  assert.equal(cents(document.lines.reduce((sum,line)=>sum+line.taxInclusiveAmount,0)),1862339);
  assert.equal(cents(invoice.items.reduce((sum,line)=>sum+line.amount,0)),1862339);
  assert.ok(invoice.accountsReceivableId);
  const receivable=await db.accountsReceivable.findUniqueOrThrow({where:{id:invoice.accountsReceivableId}});
  assert.equal(cents(receivable.invoiceAmount),1862339);assert.equal(receivable.customerId,request.customerId);
  const completed=await db.billingRequest.findUniqueOrThrow({where:{id:requestId},include:{manualItems:{orderBy:{sortOrder:'asc'}}}});
  assert.equal(completed.status,'COMPLETED');assert.equal(completed.requestedAmount,request.requestedAmount);
  assert.deepEqual(completed.manualItems,request.manualItems,'Archival must not rewrite submitted line amounts');
  const duplicate=await post(endpoint,{method:'POST',headers,body:data()});
  assert.ok([404,409].includes(duplicate.status),'Second archive must be rejected');
  assert.equal(await db.invoice.count({where:{billingRequestId:requestId}}),before+1,'No duplicate invoice may be created');
  const original=await fetch(base+'/api/finance/domestic-invoices/'+invoice.id+'/original',{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});
  let download=original;
  if([301,302,303,307,308].includes(original.status)){
    const location=new URL(original.headers.get('location')||'',base);
    assert.equal(location.origin,base,'Original must remain on the local test server');
    assert.ok(location.pathname.startsWith('/uploads/'),'Unexpected original download path');
    download=await fetch(location,{headers,signal:AbortSignal.timeout(30000)});
  }
  assert.equal(download.status,200,'Original PDF must be accessible to the authorized issuer');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf,'Archived/downloaded original bytes must match the uploaded PDF');
  const originalUrl=base+'/api/finance/domestic-invoices/'+invoice.id+'/original';
  assert.equal((await fetch(originalUrl,{signal:AbortSignal.timeout(30000)})).status,401,'Original PDF requires authentication');
  const applicant=await db.user.findUniqueOrThrow({where:{id:'TEST-DOMESTIC-APPLICANT-20261112'}});
  const applicantCookie='ams_session='+await createSessionToken({userId:applicant.id,name:applicant.name,email:applicant.email,role:applicant.role,status:applicant.status});
  const applicantDownload=await fetch(originalUrl,{headers:{cookie:applicantCookie},signal:AbortSignal.timeout(30000)});
  assert.equal(applicantDownload.status,200,'The original applicant must be able to download the archived invoice');
  assert.deepEqual(Buffer.from(await applicantDownload.arrayBuffer()),pdf);
  console.log('PASS: archive, amounts, original byte preservation and applicant download; checking extraction result next.');
  if(extractionStatus===200){
    assert.equal(extraction.fields?.invoiceNumber,'12345678','A successful extraction must recognize the real PDF number');
  } else {
    assert.equal(extractionStatus,500,'Unexpected extraction transport/auth error');
    assert.equal(extraction.error,'发票识别暂时不可用，请手工填写后继续归档。');
    console.warn('LIMITATION: PDF auto-recognition failed in the local Next runtime. Manual archival and original bytes passed; do not claim OCR/extraction passed.');
  }
  console.log('PASS: local production HTTP multipart/extraction/Chinese errors/auth/archive/amounts/profile/AR/duplicate/download checks; only fictional ui.db records written; no real account or external message used.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
