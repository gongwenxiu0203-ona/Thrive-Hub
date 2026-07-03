"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  deleteCustomerWithRelations,
  getCustomerDeleteImpact,
  type CustomerDeleteImpact,
} from "@/actions/customers";

export function DeleteCustomerButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<CustomerDeleteImpact | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  function openModal() {
    setOpen(true);
    setError(null);
    setImpact(null);
    setConfirmed(new Set());
    startTransition(async () => {
      try {
        setImpact(await getCustomerDeleteImpact(id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "读取关联数据失败");
      }
    });
  }

  function toggle(key: string, checked: boolean) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function confirm() {
    setError(null);
    const required = (impact?.groups ?? []).filter((g) => g.count > 0);
    const missing = required.filter((g) => !confirmed.has(g.key));
    if (missing.length > 0) {
      setError(`请逐项确认：${missing.map((g) => g.label).join("、")}`);
      return;
    }
    startTransition(async () => {
      try {
        await deleteCustomerWithRelations(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败");
      }
    });
  }

  return (
    <>
      <button className="btn-danger" onClick={openModal}>
        <Trash2 className="h-4 w-4" /> 删除
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="删除客户">
        <p className="text-sm text-slate-600">
          删除客户会同时处理下方关联数据。每一项有关联数据时都需要单独勾选确认。
        </p>
        {impact && (
          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">{impact.customerName}</p>
            {impact.groups.map((g) => (
              <label
                key={g.key}
                className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm"
              >
                <span>
                  {g.label}
                  <span className="ml-2 text-xs text-slate-400">{g.count} 条</span>
                </span>
                {g.count > 0 ? (
                  <input
                    type="checkbox"
                    checked={confirmed.has(g.key)}
                    onChange={(e) => toggle(g.key, e.target.checked)}
                  />
                ) : (
                  <span className="text-xs text-slate-400">无</span>
                )}
              </label>
            ))}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>
            取消
          </button>
          <button className="btn-danger" onClick={confirm} disabled={pending || !impact}>
            {pending ? "删除中..." : "确认删除"}
          </button>
        </div>
      </Modal>
    </>
  );
}
