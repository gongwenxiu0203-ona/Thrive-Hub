import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createSessionToken} from '../src/lib/auth';
const expected='file:'+path.resolve('backups/finance-am-workflow-20261112-01/preview.db').replaceAll('\\','/');
assert.equal(process.env.DATABASE_URL,expected);
assert.equal(process.env.FEISHU_NOTIFY_ENABLED,'false');
assert.equal(process.env.JWT_SECRET,'domestic-http-test-only-20261112-signing-key');
const db=new PrismaClient();
async function main(){
  const actor=await db.user.findUniqueOrThrow({where:{id:'TEST-DOMESTIC-OPERATOR-20261112'}});
  assert.equal(actor.email,'domestic-operator@example.invalid');assert.equal(actor.role,'ADMIN');
  const cookie='ams_session='+await createSessionToken({userId:actor.id,name:actor.name,email:actor.email,role:actor.role,status:actor.status});
  const tag=randomUUID();
  const customer=await db.customer.create({data:{brandName:`AM layout fixture ${tag}`}});
  for(const [type,mode,uploadType] of [['BRAND',null,null],['BRAND','FRAMEWORK',null],['CHANNEL',null,'CHANNEL_ARCHIVE'],['TRANSACTIONAL',null,'TRANSACTIONAL']] as const){
    const contract=await db.contract.create({data:{contractNo:`AM-UI-${tag}-${mode??type}`,type,contractMode:mode,uploadType,status:mode?'DRAFT':'IN_PROGRESS',createdById:actor.id,customerId:customer.id}});
    await db.contractAMAssignment.create({data:{contractId:contract.id,userId:actor.id,assignedById:actor.id}});
    const response=await fetch(`http://127.0.0.1:3001/contracts/${contract.id}`,{headers:{cookie},signal:AbortSignal.timeout(180000)});
    const body=await response.text();assert.equal(response.status,200);
    for(const text of [contract.contractNo,'设置时间','操作账号','domestic-operator@example.invalid','设置 AM'])assert.ok(body.includes(text),`Missing ${text} in ${mode??type}`);
    console.log('PASS detail SSR:',mode??type);
  }
  for(const category of ['brand','channel','transactional']){
    const response=await fetch(`http://127.0.0.1:3001/contracts?category=${category}`,{headers:{cookie},signal:AbortSignal.timeout(180000)});
    const body=await response.text();assert.equal(response.status,200);
    for(const text of ['批量操作','全选当前筛选结果中的合同','选择合同','AM'])assert.ok(body.includes(text),`Missing ${text} in ${category}`);
    assert.ok(!body.includes('选择合同（已选'),'Old standalone contract selector must be removed');
    console.log('PASS list SSR:',category);
  }
  console.log('PASS: seven authenticated local pages render with AM controls/metadata; fictional preview data only. Not browser visual/interaction QA.');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect());
