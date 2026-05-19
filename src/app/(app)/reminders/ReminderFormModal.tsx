"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  createReminder,
  updateReminder,
  deleteReminder,
} from "@/actions/reminders";
import { REMINDER_TYPE_LABELS } from "@/lib/constants";
import { toInputDate } from "@/lib/utils";

type Option = { id: string; name: string };

export type ReminderData = {
  id: string;
  title: string;
  content: string | null;
  remindDate: string | Date;
  type: string;
  targetId: string;
};

export function ReminderFormModal({
  users,
  reminder,
  trigger = "button",
}: {
  users: Option[];
  reminder?: ReminderData;
  trigger?: "button" | "edit";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = !!reminder;

  function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        if (isEdit) await updateReminder(reminder!.id, fd);
        else await createReminder(fd);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败");
      }
    });
  }

  function onDelete() {
    if (!reminder) return;
    startTransition(async () => {
      await deleteReminder(reminder.id);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {trigger === "button" ? (
        <button className="btn-primary" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> 新建提醒
        </button>
      ) : (
        <button
          className="btn-ghost btn-sm"
          onClick={() => setOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" /> 编辑
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? "编辑提醒" : "新建提醒"}
      >
        <form action={onSubmit} className="space-y-4">
          <div>
            <label className="label">提醒标题 *</label>
            <input
              name="title"
              className="input"
              required
              defaultValue={reminder?.title ?? ""}
            />
          </div>
          <div>
            <label className="label">提醒内容</label>
            <textarea
              name="content"
              className="input"
              rows={3}
              defaultValue={reminder?.content ?? ""}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">提醒日期 *</label>
              <input
                name="remindDate"
                type="date"
                className="input"
                required
                defaultValue={toInputDate(reminder?.remindDate)}
              />
            </div>
            <div>
              <label className="label">提醒类型</label>
              <select
                name="type"
                className="input"
                defaultValue={reminder?.type ?? "FOLLOWUP"}
              >
                {Object.entries(REMINDER_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">目标提醒人</label>
              <select
                name="targetId"
                className="input"
                defaultValue={reminder?.targetId ?? ""}
              >
                <option value="">我自己</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          <div className="flex justify-between border-t border-slate-100 pt-4">
            <div>
              {isEdit && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={onDelete}
                  disabled={pending}
                >
                  删除
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
              >
                取消
              </button>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
