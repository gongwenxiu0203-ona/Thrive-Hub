import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notificationConfig, sendFeishuNotification } from '@/lib/feishuClient';
import { runFeishuNotificationWorker } from '@/lib/feishuNotificationWorker';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

export async function POST(request: NextRequest) {
  const expected=process.env.FEISHU_NOTIFY_CRON_SECRET?.trim();
  if(!expected || expected.length<32) return NextResponse.json({error:'飞书推送定时任务尚未配置。'},{status:503});
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'') ?? '';
  const a=Buffer.from(supplied),b=Buffer.from(expected);
  if(a.length!==b.length || !timingSafeEqual(a,b)) return NextResponse.json({error:'未授权。'},{status:401});
  try {
    const config=notificationConfig();
    return NextResponse.json({ok:true,...await runFeishuNotificationWorker(prisma,config,sendFeishuNotification)});
  } catch {return NextResponse.json({error:'飞书推送未就绪或任务执行失败，请检查配置。'},{status:503});}
}
