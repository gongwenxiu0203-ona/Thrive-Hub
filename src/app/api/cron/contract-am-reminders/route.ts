import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { runContractAMReminders } from "@/lib/contractAMReminderAutomation";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
  const expected=process.env.CONTRACT_AM_CRON_SECRET?.trim();if(!expected)return NextResponse.json({error:"AM定时任务尚未配置"},{status:503});
  const auth=request.headers.get("authorization")||"",value=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
  const a=Buffer.from(expected),b=Buffer.from(value);if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:"无效的定时任务密钥"},{status:401});
  try{return NextResponse.json({ok:true,...await runContractAMReminders()});}catch{return NextResponse.json({error:"AM提醒生成失败，请检查服务日志。"},{status:500});}
}
