import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { feishuDeliveryUuid, feishuReminderUrl, feishuRetryDelay } from '../src/lib/feishuNotificationRules';
import { runFeishuNotificationWorker } from '../src/lib/feishuNotificationWorker';
import { notificationConfig, sendFeishuNotification } from '../src/lib/feishuClient';

const db=new PrismaClient();
const baseUrl='https://thrive.example.test';
const config={appId:'test-app',tenantKey:'test-tenant',baseUrl};
async function main() {
  assert.match((process.env.DATABASE_URL || '').replaceAll('\\','/'),/\/backups\/feishu-notify-[^/]+\/engine\.db$/,'Tests only run on isolated rehearsal DB');
  assert.equal(feishuReminderUrl(baseUrl,'[[href:/finance/workbench?focusRequest=123]]'),baseUrl+'/finance/workbench?focusRequest=123');
  for(const href of ['//evil.test','/\\evil.test','/api/auth/logout','/%2f%2fevil.test','/settings']) assert.equal(feishuReminderUrl(baseUrl,`[[href:${href}]]`),baseUrl+'/reminders?scope=received');
  assert.equal(feishuDeliveryUuid('a'),feishuDeliveryUuid('a'));
  assert.notEqual(feishuDeliveryUuid('a'),feishuDeliveryUuid('b'));
  assert.equal(feishuRetryDelay(3),240000);
  const rollback=new Error('ROLLBACK_FEISHU_FIXTURES');
  let sent: {openId:string;title:string;url:string;uuid:string}[]=[];
  const sender=async(openId:string,title:string,url:string,uuid:string)=>{sent.push({openId,title,url,uuid});return 'mock-message';};
  try {
    await db.$transaction(async tx=>{
      const client=tx as unknown as PrismaClient;
      const uid='FEISHU-TEST-'+randomUUID();
      const recipient=await tx.user.create({data:{id:uid,name:'Feishu test',email:uid+'@example.test',passwordHash:'NOT_A_REAL_PASSWORD',role:'USER',status:'APPROVED'}});
      const other=await tx.user.create({data:{name:'Other test',email:randomUUID()+'@example.test',passwordHash:'NOT_A_REAL_PASSWORD',role:'USER',status:'APPROVED'}});
      const binding=await tx.feishuBinding.create({data:{userId:recipient.id,appId:config.appId,tenantKey:config.tenantKey,openId:'mock-open-id',displayName:'Test',enabledAt:new Date(Date.now()-10000)}});
      const create=async(title:string,extra:Record<string,unknown>={})=>tx.reminder.create({data:{title,content:'PRIVATE BANK ACCOUNT + ATTACHMENT [[href:/finance/workbench?focusRequest=TEST]]',targetId:recipient.id,createdById:recipient.id,remindDate:new Date(Date.now()+86400000),...extra}});
      await create('old',{createdAt:new Date(Date.now()-86400000)});
      await create('deleted',{deletedAt:new Date()});
      await create('other user',{targetId:other.id});
      await create('new');
      let result=await runFeishuNotificationWorker(client,config,sender);
      assert.equal(result.sent,1,JSON.stringify({result,fixtures:await tx.reminder.findMany({where:{createdById:recipient.id},select:{title:true,createdAt:true}}),deliveries:await tx.feishuNotificationDelivery.findMany({where:{bindingId:binding.id},select:{status:true,nextAttemptAt:true,lastError:true}})}));assert.equal(sent[0].title,'new');
      assert.equal(sent[0].openId,'mock-open-id');assert.ok(!JSON.stringify(sent).includes('PRIVATE'));
      assert.equal((await runFeishuNotificationWorker(client,config,sender)).sent,0);

      const failed=await create('retry');
      result=await runFeishuNotificationWorker(client,config,async()=>{throw new Error('SECRET must not persist');});
      assert.equal(result.failed,1);
      let delivery=await tx.feishuNotificationDelivery.findUniqueOrThrow({where:{bindingId_reminderId:{bindingId:binding.id,reminderId:failed.id}}});
      assert.ok(!delivery.lastError?.includes('SECRET'));assert.equal(delivery.attempts,1);
      await tx.feishuNotificationDelivery.update({where:{id:delivery.id},data:{nextAttemptAt:new Date(0)}});
      assert.equal((await runFeishuNotificationWorker(client,config,sender)).sent,1);
      assert.equal(sent.at(-1)?.uuid,feishuDeliveryUuid(delivery.id));

      const transferred=await create('transferred');
      await tx.feishuNotificationDelivery.create({data:{bindingId:binding.id,reminderId:transferred.id}});
      await tx.reminder.update({where:{id:transferred.id},data:{targetId:other.id}});
      assert.equal((await runFeishuNotificationWorker(client,config,sender)).cancelled,1);

      const disabled=await create('disabled');
      await tx.feishuNotificationDelivery.create({data:{bindingId:binding.id,reminderId:disabled.id}});
      await tx.feishuBinding.update({where:{id:binding.id},data:{enabled:false}});
      assert.equal((await runFeishuNotificationWorker(client,config,sender)).cancelled,1);
      await create('while paused');
      await tx.feishuBinding.update({where:{id:binding.id},data:{enabled:true,enabledAt:new Date(Date.now()+100)}});
      assert.equal((await runFeishuNotificationWorker(client,config,sender)).sent,0);

      // Lease reclaim and concurrent invocation must share one unique delivery.
      await tx.feishuBinding.update({where:{id:binding.id},data:{enabledAt:new Date(Date.now()-10000)}});
      // Mark previously paused message terminal to focus concurrency assertion.
      for(const r of await tx.reminder.findMany({where:{targetId:recipient.id,title:'while paused'}})) await tx.feishuNotificationDelivery.create({data:{bindingId:binding.id,reminderId:r.id,status:'CANCELLED'}});
      const concurrent=await create('concurrent');
      const before=sent.length;
      await Promise.all([runFeishuNotificationWorker(client,config,sender),runFeishuNotificationWorker(client,config,sender)]);
      assert.equal(sent.length-before,1);
      assert.equal(await tx.feishuNotificationDelivery.count({where:{reminderId:concurrent.id,bindingId:binding.id}}),1);
      const leased=await create('lease');
      await tx.feishuNotificationDelivery.create({data:{bindingId:binding.id,reminderId:leased.id,status:'PROCESSING',attempts:1,leaseUntil:new Date(0),leaseToken:'expired'}});
      assert.equal((await runFeishuNotificationWorker(client,config,sender)).sent,1);
      const exhausted=await create('exhausted');
      await tx.feishuNotificationDelivery.create({data:{bindingId:binding.id,reminderId:exhausted.id,status:'FAILED',attempts:5,nextAttemptAt:new Date(0)}});
      assert.equal((await runFeishuNotificationWorker(client,config,sender)).sent,0);

      await assert.rejects(tx.feishuBinding.create({data:{userId:other.id,appId:config.appId,tenantKey:config.tenantKey,openId:binding.openId,displayName:'Duplicate'}}));
      await tx.feishuBinding.delete({where:{id:binding.id}});
      assert.equal(await tx.feishuNotificationDelivery.count({where:{bindingId:binding.id}}),0);
      const removed=await tx.user.create({data:{name:'Removed test',email:randomUUID()+'@example.test',passwordHash:'NOT_A_REAL_PASSWORD',role:'USER',status:'APPROVED'}});
      const removedBinding=await tx.feishuBinding.create({data:{userId:removed.id,appId:config.appId,tenantKey:config.tenantKey,openId:'deleted-user',displayName:'Test'}});
      await tx.user.delete({where:{id:removed.id}});
      assert.equal(await tx.feishuBinding.count({where:{id:removedBinding.id}}),0);
      throw rollback;
    },{timeout:60000});
  } catch(e) {if(e!==rollback) throw e;}

  process.env.FEISHU_NOTIFY_ENABLED='false';
  assert.throws(()=>notificationConfig());
  Object.assign(process.env,{FEISHU_NOTIFY_ENABLED:'true',FEISHU_NOTIFY_APP_ID:config.appId,FEISHU_NOTIFY_APP_SECRET:'mock-secret',FEISHU_NOTIFY_TENANT_KEY:config.tenantKey,NEXT_PUBLIC_APP_URL:baseUrl});
  assert.equal(notificationConfig().baseUrl,baseUrl);
  const originalFetch=globalThis.fetch;
  const payloads:Record<string,unknown>[]=[];
  globalThis.fetch=async(input,init)=>{
    payloads.push(JSON.parse(String(init?.body)));
    return Response.json(String(input).includes('/tenant_access_token/')?{code:0,tenant_access_token:'mock-token',expire:7200}:{code:0,data:{message_id:'mock-message'}});
  };
  try {
    await sendFeishuNotification('mock-open','通知',baseUrl+'/reminders','mock-uuid');
    assert.equal(payloads.at(-1)?.receive_id,'mock-open');
    assert.ok(!JSON.stringify(payloads.at(-1)).includes('mock-secret'));
    await assert.rejects(sendFeishuNotification('mock-open','通知','https://evil.test/','mock-uuid'));
    globalThis.fetch=async()=>Response.json({code:999,msg:'SECRET'});
    await assert.rejects(sendFeishuNotification('mock-open','通知',baseUrl+'/reminders','mock-uuid'),e=>e instanceof Error&&!e.message.includes('SECRET'));
  } finally {globalThis.fetch=originalFetch;}
  console.log('Feishu rules, privacy, worker dedup/concurrency/retry/lease/transfer/pause/cascade and mock provider tests passed; DB fixtures rolled back; zero real messages.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
