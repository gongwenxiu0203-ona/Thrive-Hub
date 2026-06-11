"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { restoreItem, purgeItem } from "@/actions/recycleBin";
import { type RecycleType } from "@/lib/recycleBin";

export function RecycleItemRow({
  type, id, title, subtitle, daysLeft, isAdmin,
}: {
  type: RecycleType;
  id: string;
  title: string;
  subtitle: string;
  daysLeft: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRestore() {
    startTransition(async () => {
      await restoreItem(type, id);
      router.refresh();
    });
  }

  function onPurge() {
    if (!confirm(`确认彻底删除「${title}」？此操作不可恢复。`)) return;
    startTransition(async () => {
      await purgeItem(type, id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 border-b border-slate-50 px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{title || "（未命名）"}</p>
        {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
      </div>
      <span className={`shrink-0 text-xs ${daysLeft <= 2 ? "text-rose-600" : "text-slate-400"}`}>
        {daysLeft > 0 ? `${daysLeft} 天后清除` : "即将清除"}
      </span>
      <button
        onClick={onRestore}
        disabled={pending}
        className="btn-secondary btn-sm shrink-0"
      >
        <RotateCcw className="h-3.5 w-3.5" /> 恢复
      </button>
      {isAdmin && (
        <button
          onClick={onPurge}
          disabled={pending}
          className="btn-danger btn-sm shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" /> 彻底删除
        </button>
      )}
    </div>
  );
}
