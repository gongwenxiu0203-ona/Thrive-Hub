"use client";

import { useState } from "react";
import { Share2, Copy, Check, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/** Shares the general (no-login) intake form link.
 *  Encodes the sharer identity so the public submission can auto-attribute
 *  the customer to the correct channel user (CHANNEL) or business owner (staff). */
export function IntakeLinkButton({
  channelUserId,
  staffUserId,
}: {
  channelUserId?: string;
  staffUserId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const base =
    typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams();
  if (channelUserId) params.set("channel", channelUserId);
  else if (staffUserId) params.set("staff", staffUserId);
  const url = params.toString() ? `${base}/intake?${params}` : `${base}/intake`;

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4" />
        对外信息收集
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="对外信息收集链接">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            将以下链接发送给潜在客户，对方无需登录即可填写品牌信息收集表，提交后将自动创建新客户档案。
          </p>
          <div className="flex items-center gap-2">
            <input
              className="input flex-1 bg-slate-50 text-sm"
              value={url}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button className="btn-primary shrink-0" onClick={copy}>
              {copied ? (
                <><Check className="h-4 w-4" /> 已复制</>
              ) : (
                <><Copy className="h-4 w-4" /> 复制链接</>
              )}
            </button>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            在新标签页预览表单
          </a>
        </div>
      </Modal>
    </>
  );
}
