import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runProjectDiscountReminders } from "@/lib/discountReminderAutomation";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
async function run(request:NextRequest){const expected=process.env.PROJECT_DISCOUNT_CRON_SECRET?.trim();if(!expected)return NextResponse.json({error:"PROJECT_DISCOUNT_CRON_SECRET is not configured"},{status:503});const auth=request.headers.get("authorization")||"";const supplied=auth.startsWith("Bearer ")?auth.slice(7).trim():(request.headers.get("x-cron-secret")||"").trim();if(!equal(supplied,expected))return NextResponse.json({error:"定时任务密钥无效"},{status:401});try{return NextResponse.json({ok:true,...await runProjectDiscountReminders()})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"提醒扫描失败"},{status:500})}}
export async function POST(request:NextRequest){return run(request)}
