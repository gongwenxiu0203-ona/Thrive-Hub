"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type ChannelOption = { id: string; name: string; email?: string | null };

/**
 * Generates a public, no-login info-collection link for a specific customer.
 * A channel referrer is required so submitted customers can be attributed.
 */
export function ShareIntakeButton({
  customerId,
  brandName,
  size = "sm",
  channelUserId,
  staffUserId,
  channelOptions = [],
}: {
  customerId: string;
  brandName: string;
  size?: "sm" | "md";
  channelUserId?: string;
  staffUserId?: string;
  channelOptions?: ChannelOption[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState(channelUserId ?? "");

  const resolvedChannelId = channelUserId ?? selectedChannelId;
  const canShare = Boolean(resolvedChannelId);
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams();
  if (resolvedChannelId) params.set("channel", resolvedChannelId);
  if (staffUserId) params.set("staff", staffUserId);
  const qs = params.toString();
  const url = qs
    ? `${base}/intake/${customerId}?${qs}`
    : `${base}/intake/${customerId}`;
  const lockedChannel = channelOptions.find((u) => u.id === channelUserId);

  function copy() {
    if (!canShare) return;
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

      <Modal open={open} onClose={() => setOpen(false)} title="对外信息收集链接">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            将以下链接发送给「{brandName}」的对接人，对方无需登录即可填写信息收集表。
            推荐人会自动填入表单且不可修改，客户提交后会自动写入客户详情页的渠道商字段。
          </p>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              推荐人（渠道商）*
            </span>
            {channelUserId ? (
              <input
                className="input w-full bg-slate-50 text-sm"
                value={lockedChannel?.name ?? "当前渠道商"}
                readOnly
              />
            ) : (
              <select
                className="input w-full text-sm"
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
              >
                <option value="">请选择推荐人</option>
                {channelOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.email ? ` (${u.email})` : ""}
                  </option>
                ))}
              </select>
            )}
          </label>

          {!canShare && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              请先选择推荐人，选择后才能复制或预览链接。
            </p>
          )}

          <div className="flex items-center gap-2">
            <input
              className="input flex-1 bg-slate-50 text-sm"
              value={url}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button
              className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={copy}
              disabled={!canShare}
            >
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
            className={`inline-block text-sm ${
              canShare
                ? "text-brand-600 hover:underline"
                : "pointer-events-none text-slate-300"
            }`}
          >
            在新标签页预览表单 →
          </a>
        </div>
      </Modal>
    </>
  );
}
