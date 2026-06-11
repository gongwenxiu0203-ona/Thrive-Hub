"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Download, BarChart3, NotebookPen, BookOpen } from "lucide-react";
import { addProjectEntry, importWorkLogEntries } from "@/actions/projects";
import { formatDateTime, cn } from "@/lib/utils";

type Entry = {
  id: string;
  kind: string;       // DAILY | DATA | NODE
  content: string;
  authorName: string;
  fromWorkLog: boolean;
  createdAt: string;
};

const KIND_META: Record<string, { label: string; dot: string; badge: string }> = {
  DAILY: { label: "日常工作", dot: "bg-brand-500", badge: "bg-brand-50 text-brand-700" },
  DATA:  { label: "数据维度", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  NODE:  { label: "流程节点", dot: "bg-slate-500", badge: "bg-slate-100 text-slate-600" },
};

export function ProjectTimeline({ projectId, entries }: { projectId: string; entries: Entry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<"DAILY" | "DATA">("DAILY");
  const [filter, setFilter] = useState<"ALL" | "DAILY" | "DATA">("ALL");
  const [note, setNote] = useState<string | null>(null);

  const shown = filter === "ALL" ? entries : entries.filter((e) => e.kind === filter);

  function submit() {
    if (!content.trim()) return;
    startTransition(async () => {
      const result = await addProjectEntry(projectId, content, kind);
      if (result.ok) {
        setContent("");
        router.refresh();
      } else {
        setNote(result.error ?? "添加失败");
      }
    });
  }

  function importLogs() {
    setNote(null);
    startTransition(async () => {
      const result = await importWorkLogEntries(projectId);
      if (!result.ok) { setNote(result.error ?? "拉取失败"); return; }
      setNote(result.imported > 0
        ? `✅ 已从工作日志拉取 ${result.imported} 条进度`
        : "没有新的工作日志可拉取（工作日志中关联本项目后即可拉取）");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* ── 添加进度 ── */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <textarea
              className="input min-h-[64px]"
              placeholder="记录工作进度…（例如：本周完成 5 个联盟商建联，下周排期发帖）"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* 类型选择 */}
              {(["DAILY", "DATA"] as const).map((k) => (
                <label
                  key={k}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
                    kind === k
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300",
                  )}
                >
                  <input type="radio" className="hidden" checked={kind === k} onChange={() => setKind(k)} />
                  {k === "DAILY" ? <NotebookPen className="h-3 w-3" /> : <BarChart3 className="h-3 w-3" />}
                  {KIND_META[k].label}
                </label>
              ))}
              <div className="flex-1" />
              <button
                onClick={importLogs}
                disabled={pending}
                className="btn-secondary btn-sm"
                title="拉取工作日志中关联本项目的内容"
              >
                <Download className="h-3.5 w-3.5" /> 从工作日志拉取
              </button>
              <button onClick={submit} disabled={pending || !content.trim()} className="btn-primary btn-sm">
                <Send className="h-3.5 w-3.5" /> {pending ? "提交中…" : "添加进度"}
              </button>
            </div>
            {note && (
              <p className={`mt-2 text-xs ${note.startsWith("✅") ? "text-emerald-600" : "text-slate-500"}`}>{note}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── 筛选 ── */}
      <div className="flex gap-1.5">
        {([
          { key: "ALL", label: `全部（${entries.length}）` },
          { key: "DAILY", label: `日常工作（${entries.filter((e) => e.kind === "DAILY").length}）` },
          { key: "DATA", label: `数据维度（${entries.filter((e) => e.kind === "DATA").length}）` },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── 时间瀑布流 ── */}
      {shown.length === 0 ? (
        <div className="card px-4 py-10 text-center text-sm text-slate-400">
          暂无进度记录，在上方添加第一条工作进度
        </div>
      ) : (
        <div className="relative space-y-0 pl-5">
          {/* 竖线 */}
          <span className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" />
          {shown.map((e) => {
            const meta = KIND_META[e.kind] ?? KIND_META.DAILY;
            return (
              <div key={e.id} className="relative pb-5 pl-5">
                {/* 圆点 */}
                <span className={`absolute left-[-17px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${meta.dot} shadow`} />
                <div className="card p-3.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-slate-800">{e.authorName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}>{meta.label}</span>
                    {e.fromWorkLog && (
                      <span className="flex items-center gap-0.5 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                        <BookOpen className="h-2.5 w-2.5" /> 工作日志
                      </span>
                    )}
                    <span className="ml-auto text-slate-400">{formatDateTime(e.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{e.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
