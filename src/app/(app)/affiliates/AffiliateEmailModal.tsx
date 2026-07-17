"use client";

import { useState, useEffect } from "react";
import { Mail, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export function AffiliateEmailModal({
  affiliateName,
  toEmail,
  onClose,
}: {
  affiliateName: string;
  toEmail: string;
  onClose: () => void;
}) {
  const [fromEmail, setFromEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 默认发件邮箱 = 操作用户的注册邮箱
  useEffect(() => {
    fetch("/api/affiliates/send-email")
      .then((r) => r.json())
      .then((d) => { if (d.defaultFrom) setFromEmail(d.defaultFrom); })
      .catch(() => {});
  }, []);

  async function onSend() {
    if (!subject.trim()) { setError("请填写邮件主题"); return; }
    if (!content.trim()) { setError("请填写邮件内容"); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/affiliates/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: toEmail, fromEmail, subject, content }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "发送失败"); return; }
      setDone(true);
      setTimeout(onClose, 1500);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2"><Mail className="h-4 w-4 text-brand-600" />发送邮件给 {affiliateName}</span>}
      size="md"
      closeOnBackdrop={!sending}
      closeOnEscape={!sending}
    >
        {done ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <Send className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-slate-800">邮件已发送</p>
            <p className="mt-1 text-xs text-slate-400">已抄送一份到你的发件邮箱留底</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">发件邮箱（默认你的注册邮箱）</label>
              <input className="input" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)}
                placeholder="your@email.com" />
              <p className="mt-1 text-[11px] text-slate-400">将作为回复地址，并抄送一份到此邮箱留底</p>
            </div>
            <div>
              <label className="label">收件人</label>
              <input className="input bg-slate-50" value={toEmail} readOnly />
            </div>
            <div>
              <label className="label">主题 *</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="邮件主题" />
            </div>
            <div>
              <label className="label">正文 *</label>
              <textarea className="input min-h-[140px]" value={content} onChange={(e) => setContent(e.target.value)}
                placeholder="写下邮件内容…" />
            </div>
            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{error}</div>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={onClose} className="btn-secondary text-sm">取消</button>
              <button onClick={onSend} disabled={sending} className="btn-primary text-sm">
                <Send className="h-4 w-4" />{sending ? "发送中…" : "发送邮件"}
              </button>
            </div>
          </div>
        )}
    </Modal>
  );
}
