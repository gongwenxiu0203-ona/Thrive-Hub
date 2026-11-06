import { NextRequest, NextResponse } from "next/server";
import { completeAuthorization, cookieOptions, currentFeishuUser, OAUTH_COOKIE } from "@/lib/feishuOAuth";
import { notificationConfig } from "@/lib/feishuClient";
export async function GET(req: NextRequest) {
  let base: string;
  try { base = notificationConfig().baseUrl; } catch {
    const res = NextResponse.json({ error: "飞书通知配置不完整" }, { status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    res.cookies.set(OAUTH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return res;
  }
  let result = "error";
  try { const user = await currentFeishuUser(); if (user) { await completeAuthorization(req, user.id); result = "bound"; } } catch { /* Do not reflect code, credentials or provider response. */ }
  const res = NextResponse.redirect(`${base}/settings?feishu=${result}`);
  res.cookies.set(OAUTH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
