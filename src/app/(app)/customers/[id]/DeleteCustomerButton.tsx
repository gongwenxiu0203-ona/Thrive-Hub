"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { deleteCustomer } from "@/actions/customers";

export function DeleteCustomerButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCustomer(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败");
      }
    });
  }

  return (
    <>
      <button className="btn-danger" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> 删除
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="删除客户">
        <p className="text-sm text-slate-600">
          确认删除该客户？关联的合同与附件也将一并删除，此操作不可撤销。
        </p>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>
            取消
          </button>
          <button className="btn-danger" onClick={confirm} disabled={pending}>
            {pending ? "删除中…" : "确认删除"}
          </button>
        </div>
      </Modal>
    </>
  );
}
