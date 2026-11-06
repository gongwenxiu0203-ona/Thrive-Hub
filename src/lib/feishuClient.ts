const API = "https://open.feishu.cn/open-apis";
export function notificationConfig() {
  const appId = process.env.FEISHU_NOTIFY_APP_ID?.trim();
  const appSecret = process.env.FEISHU_NOTIFY_APP_SECRET?.trim();
  const tenantKey = process.env.FEISHU_NOTIFY_TENANT_KEY?.trim();
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (process.env.FEISHU_NOTIFY_ENABLED !== "true" || !appId || !appSecret || !tenantKey || !raw)
    throw new Error("飞书通知尚未配置完成");
  const base = new URL(raw);
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/" ||
    (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))))
    throw new Error("网站地址配置不正确");
  return { appId, appSecret, tenantKey, baseUrl: base.origin, callbackUrl: `${base.origin}/api/settings/feishu/callback` };
}

export async function feishuRequest<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(`${API}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) }); }
  catch { throw new Error("飞书连接失败或超时，请稍后重试"); }
  let body: Record<string, unknown>;
  try { body = await res.json(); } catch { throw new Error("飞书返回异常响应"); }
  if (!res.ok || (body.code !== undefined && body.code !== 0) || body.error)
    throw new Error(`飞书请求失败（${typeof body.code === "number" ? body.code : res.status}），请检查应用权限及配置`);
  return body as T;
}
let cached: { key: string; token: string; expires: number } | undefined;
async function tenantToken() {
  const config = notificationConfig();
  const key = `${config.appId}:${config.appSecret}`;
  if (cached?.key === key && cached.expires > Date.now() + 60_000) return cached.token;
  const data = await feishuRequest<{ tenant_access_token: string; expire: number }>("/auth/v3/tenant_access_token/internal", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });
  if (!data.tenant_access_token) throw new Error("飞书应用凭证获取失败");
  cached = { key, token: data.tenant_access_token, expires: Date.now() + Math.max(60, data.expire || 3600) * 1000 };
  return cached.token;
}
export async function sendFeishuNotification(openId: string, title: string, url: string, uuid: string): Promise<string> {
  const config = notificationConfig();
  const target = new URL(url);
  if (target.origin !== config.baseUrl || target.username || target.password) throw new Error("通知链接无效");
  const data = await feishuRequest<{ data?: { message_id?: string } }>("/im/v1/messages?receive_id_type=open_id", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await tenantToken()}` },
    body: JSON.stringify({ receive_id: openId, msg_type: "post", uuid,
      content: JSON.stringify({ zh_cn: { title: title.slice(0, 200), content: [[{ tag: "text", text: "你有一条网站通知，请登录查看详情。" }], [{ tag: "a", text: "查看详情", href: target.href }]] } }) }),
  });
  if (!data.data?.message_id) throw new Error("飞书未返回消息编号");
  return data.data.message_id;
}
