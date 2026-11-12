import assert from 'node:assert/strict';
import { domesticPrefill,allocateDomesticAmounts,domesticMetadata,domesticInvoiceLabel } from '../src/lib/domesticBilling';
import { resolveDomesticBillingDetails } from '../src/lib/domesticBillingDetails';
import type { PrismaClient } from '@prisma/client';
const amounts=domesticPrefill(18623.39,[{netAmount:6685,taxAmount:66.85,taxRate:.01},{netAmount:11754,taxAmount:117.54,taxRate:.01}]);
assert.deepEqual(amounts,{netAmount:18439,taxAmount:184.39,taxInclusiveAmount:18623.39,taxRate:1});
assert.equal(domesticPrefill(101,[]).netAmount,100);
const mixed=domesticPrefill(209,[{netAmount:100,taxAmount:3,taxRate:.03},{netAmount:100,taxAmount:6,taxRate:.06}]);
assert.equal(mixed.netAmount,200);assert.equal(mixed.taxAmount,9);assert.equal(mixed.taxInclusiveAmount,209);
const split=allocateDomesticAmounts([{amount:103,netAmount:100,taxAmount:3,grossAmount:103,taxRate:.03},{amount:106,netAmount:100,taxAmount:6,grossAmount:106,taxRate:.06}],200,9,.045);
assert.equal(split[0].taxRate,.03);assert.equal(split[1].taxRate,.06);
const rounded=allocateDomesticAmounts([{amount:1},{amount:1},{amount:1}],2.97,.03,.01);
assert.equal(Math.round(rounded.reduce((s,x)=>s+x.taxInclusiveAmount,0)*100),300);
assert.equal(Math.round(rounded.reduce((s,x)=>s+x.netAmount,0)*100),297);
assert.equal(domesticMetadata('开票资料:profile1;发票类型:SPECIAL').profileId,'profile1');
assert.equal(domesticInvoiceLabel('SPECIAL'),'增值税专用发票');
assert.deepEqual(domesticMetadata('DOMESTIC_META:{"snapshot":{"invoiceTitle":{}}}').snapshot,undefined);
async function snapshotChecks(){
  const profile={invoiceTitle:'真实抬头',taxNumber:'TAX123',registeredAddress:'地址',registeredPhone:'123',bankName:'银行',bankAccount:'001',deliveryEmail:'invoice@example.test'};
  const fake={customerBillingProfile:{findFirst:async({where}:any)=>where.id==='profile1'&&where.customerId==='customer1'?profile:null},financeAccountProfile:{findFirst:async()=>null}} as unknown as PrismaClient;
  const note='DOMESTIC_META:'+JSON.stringify({profileId:'profile1',invoiceKind:'SPECIAL',snapshot:{...profile,invoiceTitle:'客户端伪造',invoiceType:'VAT_SPECIAL',source:'SNAPSHOT'}});
  assert.equal((await resolveDomesticBillingDetails(fake,note,'customer1',true))?.invoiceTitle,'真实抬头');
  assert.equal(await resolveDomesticBillingDetails(fake,'开票资料:profile1;发票类型:NORMAL','other-customer'),null);
  assert.equal((await resolveDomesticBillingDetails(fake,'开票资料:profile1;发票类型:NORMAL','customer1'))?.source,'CURRENT');
  assert.equal((await resolveDomesticBillingDetails(fake,note,'customer1'))?.source,'SNAPSHOT');
  console.log('Domestic metadata/server snapshot/profile scope, inclusive total, mixed-rate preservation and allocation-cent tests passed (no DB writes).');
}
snapshotChecks().catch(error=>{console.error(error);process.exitCode=1;});
