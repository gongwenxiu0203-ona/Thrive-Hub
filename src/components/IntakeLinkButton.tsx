"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export function IntakeLinkButton({ compact = false }: { channelUserId?: string; staffUserId?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setOpen(true);
    if (url || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/intake/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "GENERAL_NEW" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成链接失败");
      setUrl(data.url);
      setExpiresAt(data.expiresAt ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成链接失败");
    } finally { setLoading(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return <>
    <button type="button" onClick={generate} className={compact ? "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white" : "btn-secondary"}>
      <Link2 className={compact ? "h-[18px] w-[18px]" : "h-4 w-4"} />
      客户门户表单
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="通用客户门户链接">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">此链接可转发给多个潜在客户。外部提交只会进入待审核队列，不会直接创建或覆盖正式客户。</p>
        {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />正在生成安全链接…</div>}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {url && <>
          <div className="flex gap-2"><input className="input min-w-0 flex-1 bg-slate-50 text-sm" readOnly value={url} onFocus={(e) => e.currentTarget.select()} /><button className="btn-primary shrink-0" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "已复制" : "复制链接"}</button></div>
          {expiresAt && <p className="text-xs text-slate-500">有效期至 {new Date(expiresAt).toLocaleDateString("zh-CN")}</p>}
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ExternalLink className="h-4 w-4" />预览表单</a>
        </>}
      </div>
    </Modal>
  </>;
}
