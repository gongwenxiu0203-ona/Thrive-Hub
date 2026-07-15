"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Share2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type ChannelOption = { id: string; name: string; email?: string | null };

export function ShareIntakeButton({ customerId, brandName, size = "sm" }: { customerId: string; brandName: string; size?: "sm" | "md"; channelUserId?: string; staffUserId?: string; channelOptions?: ChannelOption[] }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate(e: React.MouseEvent) {
    e.stopPropagation(); setOpen(true);
    if (url || loading) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/intake/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "CUSTOMER_UPDATE", customerId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成链接失败");
      setUrl(data.url); setExpiresAt(data.expiresAt ?? "");
    } catch (e) { setError(e instanceof Error ? e.message : "生成链接失败"); }
    finally { setLoading(false); }
  }
  async function copy() { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  return <>
    <button type="button" className={size === "sm" ? "btn-ghost btn-sm" : "btn-secondary"} onClick={generate} title="对外信息收集"><Share2 className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />对外信息收集</button>
    <Modal open={open} onClose={() => setOpen(false)} title="指定客户信息补充链接">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">将链接发送给“{brandName}”的相关人员。提交内容需要管理员审核，不会直接覆盖现有客户资料。</p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">链接等同于填写凭证，仅发送给该客户相关人员；可由多人重复填写。</p>
        {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />正在生成安全链接…</div>}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {url && <><div className="flex gap-2"><input className="input min-w-0 flex-1 bg-slate-50 text-sm" readOnly value={url} onFocus={(e) => e.currentTarget.select()} /><button className="btn-primary shrink-0" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "已复制" : "复制链接"}</button></div>{expiresAt && <p className="text-xs text-slate-500">有效期至 {new Date(expiresAt).toLocaleDateString("zh-CN")}</p>}<a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ExternalLink className="h-4 w-4" />预览表单</a></>}
      </div>
    </Modal>
  </>;
}
