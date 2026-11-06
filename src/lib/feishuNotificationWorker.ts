import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isStaff } from './dataScope';
import { feishuDeliveryUuid, feishuReminderUrl, feishuRetryDelay } from './feishuNotificationRules';

export type FeishuWorkerConfig = { appId: string; tenantKey: string; baseUrl: string };
type Sender = (openId: string, title: string, url: string, uuid: string) => Promise<string>;
const MAX_ATTEMPTS = 5;
const LEASE_MS = 90_000;

/** Reads only committed reminders; network I/O is never inside a SQLite transaction. */
export async function runFeishuNotificationWorker(db: PrismaClient, config: FeishuWorkerConfig, send: Sender, options: {limit?: number; budgetMs?: number} = {}) {
  const started = Date.now();
  const deadline = started + (options.budgetMs ?? 35_000);
  const limit = Math.max(1, Math.min(50, options.limit ?? 20));
  const counts = { queued: 0, sent: 0, failed: 0, cancelled: 0 };
  // Ineligible/unbound recipients cannot leave live jobs behind. Bindings use ON DELETE CASCADE.
  const active = await db.feishuBinding.findMany({where:{enabled:true,appId:config.appId,tenantKey:config.tenantKey,user:{status:'APPROVED',role:{in:['ADMIN','USER']}}},orderBy:{id:'asc'}});
  for (const binding of active) {
    if(Date.now() >= deadline) break;
    const reminders = await db.reminder.findMany({where:{targetId:binding.userId,deletedAt:null,createdAt:{gte:binding.enabledAt},feishuDeliveries:{none:{bindingId:binding.id}}},orderBy:[{createdAt:'asc'},{id:'asc'}],take:limit});
    for(const reminder of reminders) {
      // Upsert plus the unique pair makes concurrent cron invocations safe.
      // Use the same JS clock as the due-job filter, not a potentially slightly
      // ahead engine-side default timestamp (otherwise a new job may miss this scan).
      await db.feishuNotificationDelivery.upsert({where:{bindingId_reminderId:{bindingId:binding.id,reminderId:reminder.id}},update:{},create:{bindingId:binding.id,reminderId:reminder.id,nextAttemptAt:new Date()}});
      counts.queued++;
    }
  }
  const now = new Date();
  const jobs = await db.feishuNotificationDelivery.findMany({where:{OR:[{status:{in:['PENDING','FAILED']},attempts:{lt:MAX_ATTEMPTS},nextAttemptAt:{lte:now}},{status:'PROCESSING',leaseUntil:{lte:now}}]},orderBy:[{nextAttemptAt:'asc'},{id:'asc'}],take:limit});
  for(const candidate of jobs) {
    if(Date.now() >= deadline) break;
    const claimTime=new Date();
    const leaseToken=randomUUID();
    const claimed=await db.feishuNotificationDelivery.updateMany({where:{id:candidate.id,OR:[{status:{in:['PENDING','FAILED']},attempts:{lt:MAX_ATTEMPTS},nextAttemptAt:{lte:claimTime}},{status:'PROCESSING',leaseUntil:{lte:claimTime}}]},data:{status:'PROCESSING',leaseToken,leaseUntil:new Date(Date.now()+LEASE_MS),attempts:{increment:1}}});
    if(!claimed.count) continue;
    const job=await db.feishuNotificationDelivery.findUnique({where:{id:candidate.id},include:{binding:{include:{user:true}},reminder:true}});
    if(!job || job.leaseToken!==leaseToken) continue;
    const owned={id:job.id,leaseToken,status:'PROCESSING'};
    const {binding,reminder}=job;
    if(!binding.enabled || binding.appId!==config.appId || binding.tenantKey!==config.tenantKey || binding.user.status!=='APPROVED' || !isStaff(binding.user.role) || reminder.targetId!==binding.userId || reminder.deletedAt || reminder.createdAt<binding.enabledAt || job.attempts>MAX_ATTEMPTS) {
      await db.feishuNotificationDelivery.updateMany({where:owned,data:{status:'CANCELLED',leaseToken:null,leaseUntil:null,lastError:null}});
      counts.cancelled++;continue;
    }
    try {
      const messageId=await send(binding.openId,reminder.title.slice(0,160),feishuReminderUrl(config.baseUrl,reminder.content),feishuDeliveryUuid(job.id));
      // A pause/unbind may have cancelled the job while the HTTP call was in flight.
      await db.feishuNotificationDelivery.updateMany({where:owned,data:{status:'SENT',sentAt:new Date(),messageId,lastError:null,leaseToken:null,leaseUntil:null}});
      counts.sent++;
    } catch {
      // Never persist provider response text (may contain identities, tokens or payloads).
      await db.feishuNotificationDelivery.updateMany({where:owned,data:{status:'FAILED',lastError:job.attempts>=MAX_ATTEMPTS?'多次发送失败，请检查应用权限和可用范围。':'发送失败，系统将自动重试。',nextAttemptAt:new Date(Date.now()+feishuRetryDelay(job.attempts)),leaseToken:null,leaseUntil:null}});
      counts.failed++;
    }
  }
  return counts;
}
