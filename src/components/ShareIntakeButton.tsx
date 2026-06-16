"use client";

import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * Generates a public, no-login info-collection link for a specific customer.
 * The customer's brand name is pre-filled on the public form (still editable).
 */
export function ShareIntakeButton({
  customerId,
  brandName,
  size = "sm",
  channelUserId,
  staffUserId,
}: {
  customerId: string;
  brandName: string;
  size?: "sm" | "md";
  channelUserId?: string;
  staffUserId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams();
  if (channelUserId) params.set("channel", channelUserId);
  else if (staffUserId) params.set("staff", staffUserId);
  const qs = params.toString();
  const url = qs
    ? `${base}/intake/${customerId}?${qs}`
    : `${base}/intake/${customerId}`;

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <button
        className={size === "sm" ? "btn-ghost btn-sm" : "btn-secondary"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="对外信息收集"
      >
        <Share2 className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        对外信息收集
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="对外信息收集链接"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            将以下链接发送给「{brandName}」的对接人，对方无需登录即可填写信息收集表。
            表单中「品牌/店铺名称」已默认填好，对方仍可编辑修改。提交后将自动更新该客户的资料。
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
                <>
                  <Check className="h-4 w-4" /> 已复制
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> 复制链接
                </>
              )}
            </button>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm text-brand-600 hover:underline"
          >
            在新标签页预览表单 →
          </a>
        </div>
      </Modal>
    </>
  );
}
