"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

type Status = {
  configured: boolean;
  binding: { displayName: string; enabled: boolean; lastTestAt: string | null } | null;
  latestDelivery: { status: string; lastError: string | null; sentAt: string | null } | null;
};

async function request(path = "", init?: RequestInit) {
  const response = await fetch(`/api/settings/feishu${path}`, { ...init, cache: "no-store" });
  let data;
  try { data = await response.json(); } catch { throw new Error("服务返回异常，请刷新页面后重试。"); }
  if (!response.ok) {
    if (response.status === 401) throw new Error("登录已失效，请重新登录后设置。");
    if (response.status === 403) throw new Error("飞书推送仅向已启用的内部账号开放。");
    throw new Error(typeof data?.error === "string" ? data.error : "操作失败，请稍后重试。");
  }
  return data;
}

export function FeishuNotificationSettings() {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const actionLock = useRef(false);
  const load = useCallback(async () => {
    const next = await request();
    if (typeof next?.configured !== "boolean" || !("binding" in next)) throw new Error("状态读取失败，请重试。");
    setData(next);
  }, []);

  useEffect(() => {
    let active = true;
    const result = new URLSearchParams(window.location.search).get("feishu");
    if (result === "bound") setMessage("飞书账号已绑定，新通知将按推送开关同步。");
    if (result === "error") setError("飞书绑定未完成，请重试；若仍失败，请联系管理员检查应用配置。");
    load().catch((e) => { if (active) setError(e instanceof Error ? e.message : "无法读取飞书推送状态，请重新加载。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  async function act(action: "start" | "toggle" | "unbind" | "test" | "reload") {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(action); setError(""); setMessage("");
    try {
      if (action === "start") {
        const result = await request("/start", { method: "POST" });
        const url = new URL(result.url);
        if (url.protocol !== "https:" || url.hostname !== "accounts.feishu.cn") throw new Error("授权地址异常，请联系管理员。");
        window.location.assign(url.href);
        return;
      }
      if (action === "toggle") {
        await request("", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !data?.binding?.enabled }) });
        setMessage(data?.binding?.enabled ? "推送已暂停，站内信仍正常接收。" : "推送已启用，仅同步此后产生的新通知。");
      }
      if (action === "unbind") {
        await request("", { method: "DELETE" });
        setConfirmUnbind(false); setMessage("已解绑飞书，不再向该账号发送新通知。");
      }
      if (action === "test") {
        await request("/test", { method: "POST" });
        setMessage("测试消息已发送，请到飞书查看。每分钟最多发送一次。");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络请求失败，请检查网络后重试。");
    } finally { setBusy(""); actionLock.current = false; }
  }

  const binding = data?.binding;
  const status = !data ? "状态未加载" : !data.configured ? "服务未配置" : !binding ? "未绑定" : binding.enabled ? "推送已启用" : "推送已暂停";
  const button = "btn-secondary min-h-11 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
  return (
    <section aria-labelledby="feishu-notifications-heading" aria-busy={loading || !!busy} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="feishu-notifications-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Bell aria-hidden="true" className="h-4 w-4 text-brand-600" />飞书消息推送</h2>
        {!loading && <span className={`rounded px-2 py-1 text-xs font-medium ${data?.configured && binding?.enabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{status}</span>}
      </div>
      <p className="text-sm leading-6 text-slate-600">将新站内信的标题和详情链接同步到你绑定的企业飞书账号。银行账号、附件及财务备注不会直接发送到飞书；打开详情仍需登录网站并验证权限。</p>
      {loading ? <p role="status" className="text-sm text-slate-600">正在读取推送设置…</p> : <>
        {data && !data.configured && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">管理员尚未完成飞书应用配置。暂时无法绑定或发送消息；已绑定账号仍可暂停推送或解绑。</p>}
        {binding ? <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="break-words text-sm text-slate-700">已绑定账号：<span className="font-medium">{binding.displayName}</span></p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={!!busy || (!data?.configured && !binding.enabled)} onClick={() => void act("toggle")}>{busy === "toggle" ? "保存中…" : binding.enabled ? "暂停推送" : "启用推送"}</button>
            <button type="button" className={button} disabled={!!busy || !data?.configured || !binding.enabled} onClick={() => void act("test")}>{busy === "test" ? "发送中…" : "发送测试消息"}</button>
            <button type="button" className={`${button} text-rose-700`} disabled={!!busy || confirmUnbind} onClick={() => setConfirmUnbind(true)}>解绑</button>
          </div>
          {confirmUnbind && <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-sm text-slate-700">解绑后停止向该飞书账号推送通知，网站内的通知不受影响。确定解绑吗？</p>
            <div className="flex flex-wrap gap-2"><button type="button" className={`${button} text-rose-700`} disabled={!!busy} onClick={() => void act("unbind")}>{busy === "unbind" ? "解绑中…" : "确认解绑"}</button><button type="button" className={button} disabled={!!busy} onClick={() => setConfirmUnbind(false)}>取消</button></div>
          </div>}
        </div> : data && <button type="button" className="btn-primary min-h-11 text-sm disabled:opacity-50" disabled={!!busy || !data.configured} onClick={() => void act("start")}>{busy === "start" ? "正在前往飞书…" : "绑定飞书并启用推送"}</button>}
        <p className="text-xs leading-5 text-slate-600">绑定或重新启用后只推送新通知，不补发历史消息。飞书暂时不可用时系统将重试，站内信不受影响。</p>
        {data?.latestDelivery && <p className="break-words text-xs leading-5 text-slate-600">最近推送：{({ SENT: "已发送", PENDING: "等待发送", PROCESSING: "发送中", FAILED: "发送失败", CANCELLED: "已取消" } as Record<string, string>)[data.latestDelivery.status] || "等待处理"}{data.latestDelivery.status === "FAILED" ? "。系统将按重试规则处理；持续失败请联系管理员检查应用权限。" : ""}</p>}
      </>}
      <div aria-live="polite" aria-atomic="true">{message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}</div>
      {error && <div role="alert" className="space-y-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><p>{error}</p><button type="button" className={`${button} bg-white`} disabled={!!busy} onClick={() => void act("reload")}>{busy === "reload" ? "加载中…" : "重新加载状态"}</button></div>}
    </section>
  );
}
