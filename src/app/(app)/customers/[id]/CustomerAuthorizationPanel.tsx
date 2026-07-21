"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteCustomerAuthorizationInfo,
  saveCustomerAuthorizationInfo,
} from "@/actions/customerAuthorizationInfo";
import { CUSTOMER_AUTHORIZATION_PLATFORMS } from "@/lib/constants";

type AuthInfo = {
  id: string;
  platform: string;
  accountInfo: string;
  createdByName: string | null;
  updatedAt: string;
};

export function CustomerAuthorizationPanel({
  customerId,
  items,
  canEdit,
}: {
  customerId: string;
  items: AuthInfo[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<AuthInfo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  function save(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveCustomerAuthorizationInfo(customerId, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setEditing(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("确认删除这条客户授权信息？")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCustomerAuthorizationInfo(customerId, id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div id="authorization-info" className="scroll-mt-24">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700">
          <KeyRound className="h-3.5 w-3.5" />
        </div>
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-bold text-slate-700"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          客户授权信息
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="h-px flex-1 bg-slate-200" />
        {canEdit && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setEditing(null);
              setShowForm((v) => !v);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> 新增
          </button>
        )}
      </div>

      {expanded && <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {items.length === 0 && !showForm ? (
          <p className="py-5 text-center text-sm text-slate-400">暂无客户授权信息</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{item.platform}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{item.accountInfo}</p>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {item.createdByName ? `创建人：${item.createdByName}` : "创建人：-"} · 更新：{item.updatedAt}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setEditing(item);
                          setShowForm(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        disabled={pending}
                        onClick={() => remove(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm && canEdit && (
          <form action={save} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input type="hidden" name="id" value={editing?.id ?? ""} />
            <div>
              <label className="label text-xs">平台</label>
              <select name="platform" className="input" defaultValue={editing?.platform ?? ""} required>
                <option value="" disabled>请选择平台</option>
                {CUSTOMER_AUTHORIZATION_PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs">具体账号信息</label>
              <textarea
                name="accountInfo"
                className="input min-h-24"
                defaultValue={editing?.accountInfo ?? ""}
                placeholder="账号、密码、授权账号、备注等"
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                取消
              </button>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        )}
        {error && !showForm && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </div>}
    </div>
  );
}
