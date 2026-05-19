"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { quickCreateCustomer } from "@/actions/customers";

export function QuickCreateModal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await quickCreateCustomer(name);
      if (!result.ok) {
        setError(result.fieldErrors?.brandName ?? result.error ?? "创建失败");
        return;
      }
      setOpen(false);
      setName("");
      router.push(`/customers/${result.customerId}`);
    });
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <Zap className="h-4 w-4" /> 快速新建
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="快速新建客户"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            仅需填写客户名称即可创建，其余信息可稍后在详情页补全，或通过「对外信息收集」让客户自助填写。
          </p>
          <div>
            <label className="label">品牌/店铺名称 *</label>
            <input
              className={`input ${
                error ? "border-rose-400 ring-2 ring-rose-100" : ""
              }`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="如：AuroraTech"
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              取消
            </button>
            <button
              className="btn-primary"
              onClick={submit}
              disabled={pending}
            >
              {pending ? "创建中…" : "创建并进入详情"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
