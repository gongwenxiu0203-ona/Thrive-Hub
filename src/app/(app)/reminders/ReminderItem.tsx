"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, RotateCcw } from "lucide-react";
import { toggleRead } from "@/actions/reminders";
import { Badge } from "@/components/ui/Badge";
import { ReminderFormModal, type ReminderData } from "./ReminderFormModal";
import {
  REMINDER_TYPE_LABELS,
  REMINDER_TYPE_COLORS,
  labelOf,
} from "@/lib/constants";
import { formatDate, daysUntil, cn } from "@/lib/utils";

const REMINDER_TYPE_HREF: Record<string, string> = {
  DELIVERY:         "/finance",
  MEETING:          "/tasks",
  CONTRACT_EXPIRY:  "/contracts",
  REVIEW:           "/tasks",
  FOLLOWUP:         "/customers",
  STATUS_CHECK:     "/customers",
};

type Option = { id: string; name: string };

export function ReminderItem({
  reminder,
  targetName,
  creatorName,
  canManage,
  users,
}: {
  reminder: ReminderData & { isRead: boolean };
  targetName: string;
  creatorName: string;
  canManage: boolean;
  users: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const dleft = daysUntil(reminder.remindDate);
  const navHref = REMINDER_TYPE_HREF[reminder.type] ?? "/tasks";

  function toggle() {
    startTransition(async () => {
      await toggleRead(reminder.id, !reminder.isRead);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        reminder.isRead
          ? "border-slate-200 bg-white"
          : "border-brand-200 bg-brand-50/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={navHref}
            className={cn(
              "text-sm font-medium hover:underline hover:text-brand-600 transition-colors",
              reminder.isRead ? "text-slate-600" : "text-slate-900",
            )}
          >
            {reminder.title}
          </Link>
          <Badge className={REMINDER_TYPE_COLORS[reminder.type]}>
            {labelOf(REMINDER_TYPE_LABELS, reminder.type)}
          </Badge>
          {!reminder.isRead && (
            <span className="h-2 w-2 rounded-full bg-brand-500" />
          )}
        </div>
        {reminder.content && (
          <p className="mt-1 text-sm text-slate-500">{reminder.content}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>提醒日期：{formatDate(reminder.remindDate)}</span>
          {dleft != null && (
            <span
              className={
                dleft < 0
                  ? "text-rose-600"
                  : dleft <= 3
                    ? "text-amber-600"
                    : ""
              }
            >
              {dleft < 0
                ? `已过期 ${-dleft} 天`
                : dleft === 0
                  ? "今天"
                  : `${dleft} 天后`}
            </span>
          )}
          <span>提醒人：{targetName}</span>
          <span>创建人：{creatorName}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          className="btn-ghost btn-sm"
          onClick={toggle}
          disabled={pending}
        >
          {reminder.isRead ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" /> 标为未读
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" /> 标为已读
            </>
          )}
        </button>
        {canManage && (
          <ReminderFormModal
            users={users}
            reminder={reminder}
            trigger="edit"
          />
        )}
      </div>
    </div>
  );
}
