"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { createTask } from "@/actions/tasks";
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_CATEGORY_LABELS,
} from "@/lib/constants";

type Option = { id: string; name: string };

export function TaskFormModal({
  customers,
  users,
}: {
  customers: Option[];
  users: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createTask(fd);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败");
      }
    });
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> 新建任务
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="新建任务" wide>
        <form action={onSubmit} className="space-y-4">
          <div>
            <label className="label">任务标题 *</label>
            <input name="title" className="input" required />
          </div>
          <div>
            <label className="label">任务描述</label>
            <textarea name="description" className="input" rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">关联品牌</label>
              <select name="customerId" className="input" defaultValue="">
                <option value="">无关联品牌</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">任务类型</label>
              <select name="category" className="input" defaultValue="GENERAL">
                {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">负责人</label>
              <select name="ownerId" className="input" defaultValue="">
                <option value="">未分配</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">发布人</label>
              <select name="publisherId" className="input" defaultValue="">
                <option value="">未指定</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">优先级</label>
              <select name="priority" className="input" defaultValue="MID">
                {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">状态</label>
              <select name="status" className="input" defaultValue="TODO">
                {["TODO", "IN_PROGRESS", "REVIEW", "DONE"].map((k) => (
                  <option key={k} value={k}>
                    {TASK_STATUS_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">截止日期</label>
              <input name="dueDate" type="date" className="input" />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "保存中…" : "创建任务"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
