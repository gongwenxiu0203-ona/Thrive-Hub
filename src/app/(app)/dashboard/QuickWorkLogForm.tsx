"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { createWorkLog } from "@/actions/worklogs";

/** Lightweight inline worklog form embedded in the dashboard. Supports only
 *  the most common case: WEEKLY / MONTHLY period, single "项目管理" workType,
 *  free-text content. Heavier BD-progress flows still go to /worklogs. */
export function QuickWorkLogForm({ onSaved }: { onSaved?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [period, setPeriod] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit() {
    setError(null);
    if (!content.trim()) { setError("请填写工作进度"); return; }
    startTransition(async () => {
      const r = await createWorkLog({
        period,
        projectIds: [],
        workTypes: ["项目管理"],
        content: content.trim(),
      });
      if (!r.ok) { setError(r.error ?? "保存失败"); return; }
      setContent("");
      setDone(true);
      setTimeout(() => setDone(false), 2500);
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-brand-600" />
          <p className="text-xs font-semibold text-slate-700">快速写日志</p>
        </div>
        <div className="flex gap-1">
          {(["WEEKLY", "MONTHLY"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                period === p ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {p === "WEEKLY" ? "周报" : "月报"}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder={`写下本${period === "WEEKLY" ? "周" : "月"}的项目管理工作进度…（BD 联盟进度请到完整日志页填写）`}
        className="input text-sm"
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      <div className="mt-2 flex items-center justify-between">
        {done ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> 已保存
          </span>
        ) : <span />}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="btn-primary text-xs"
        >
          {pending ? "保存中…" : "保存日志"}
        </button>
      </div>
    </div>
  );
}
