import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/permissions";
import { feishuRequest, notificationConfig } from "./feishuClient";

export const OAUTH_COOKIE = "thraive_feishu_bind";
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/settings/feishu", maxAge: 600 };
function secret() {
  // Isolate OAuth state from website session-key rotation and legacy session configuration.
  const value = process.env.FEISHU_NOTIFY_STATE_SECRET || process.env.JWT_SECRET;
  if (!value || value.length < 32 || value === "dev-secret-change-me") throw new Error("请先配置安全的飞书授权签名密钥");
  return new TextEncoder().encode(value);
}
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  // Compare only a configured canonical origin; never trust Host / forwarded Host.
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  try { return !!origin && !!raw && origin === new URL(raw).origin; } catch { return false; }
}
export async function currentFeishuUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user && user.status === "APPROVED" && isStaff(user.role) ? user : null;
}
export async function beginAuthorization(userId: string) {
  const config = notificationConfig();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) throw new Error("请先登录");
  const sessionHash = createHash("sha256").update(session).digest("hex");
  const token = await new SignJWT({ userId, state, verifier, appId: config.appId, sessionHash })
    .setProtectedHeader({ alg: "HS256" }).setAudience("feishu-bind").setIssuedAt().setExpirationTime("10m").sign(secret());
  const url = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
  url.search = new URLSearchParams({ client_id: config.appId, response_type: "code", redirect_uri: config.callbackUrl,
    scope: "contact:user.base:readonly", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", prompt: "consent" }).toString();
  return { token, url: url.href };
}
export async function completeAuthorization(req: NextRequest, userId: string) {
  const config = notificationConfig();
  const { payload } = await jwtVerify(req.cookies.get(OAUTH_COOKIE)?.value || "", secret(), { algorithms: ["HS256"], audience: "feishu-bind" });
  const code = req.nextUrl.searchParams.get("code");
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (!session || payload.sessionHash !== createHash("sha256").update(session).digest("hex") || payload.userId !== userId || payload.appId !== config.appId || payload.state !== req.nextUrl.searchParams.get("state") || !code || typeof payload.verifier !== "string") throw new Error("授权已过期，请重新绑定");
  const token = await feishuRequest<{ access_token?: string }>("/authen/v2/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", client_id: config.appId, client_secret: config.appSecret, code, redirect_uri: config.callbackUrl, code_verifier: payload.verifier }),
  });
  if (!token.access_token) throw new Error("授权失败，请检查应用登录权限");
  const info = await feishuRequest<{ data?: { open_id?: string; tenant_key?: string; name?: string } }>("/authen/v1/user_info", { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!info.data?.open_id || info.data.tenant_key !== config.tenantKey) throw new Error("请使用本企业的飞书账号");
  // No access / refresh token is retained. Unique constraints prevent cross-user identity takeover.
  await prisma.feishuBinding.create({ data: { userId, appId: config.appId, tenantKey: config.tenantKey, openId: info.data.open_id, displayName: (info.data.name || "飞书用户").slice(0, 100), enabled: true, enabledAt: new Date() } });
}
export function apiError(message: string, status = 400) { return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }); }

export function safeFeishuError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/^(飞书通知尚未配置完成|网站地址配置不正确|请先配置安全的飞书授权签名密钥|请先绑定飞书账号|飞书连接失败或超时，请稍后重试|飞书返回异常响应|飞书应用凭证获取失败|飞书未返回消息编号|通知链接无效)$/.test(message) || /^飞书请求失败（\d+），请检查应用权限及配置$/.test(message)) return message;
  return "操作暂时失败，请稍后重试；如持续失败请联系管理员";
}
export async function withFeishuUser(handler: (user: NonNullable<Awaited<ReturnType<typeof currentFeishuUser>>>) => Promise<Response>): Promise<Response> {
  try {
    const session = await getSession();
    if (!session) return apiError("请先登录", 401);
    const user = await currentFeishuUser();
    if (!user) return apiError("仅已启用的内部账号可使用飞书通知", 403);
    return await handler(user);
  } catch (e) { return apiError(safeFeishuError(e), 503); }
}
