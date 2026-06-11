"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, X, BookOpen, Pencil, Trash2, Download, Sparkles, Undo2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  createWorkLog, updateWorkLog, softDeleteWorkLog, fetchProjectProgress,
  type WorkLogPayload,
} from "@/actions/worklogs";
import { formatDateTime, cn } from "@/lib/utils";

const WORK_TYPE_OPTIONS = ["项目管理", "BD"] as const;

type LogRow = {
  id: string;
  authorId: string;
  authorName: string;
  period: string;          // WEEKLY | MONTHLY
  projectIds: string[];
  projectNames: string[];
  workTypes: string[];
  content: string;
  logDate: string;
};

type ProjectOption = { id: string; name: string };

export default function WorkLogsClient({
  logs,
  projects,
  currentUserId,
  isAdmin,
}: {
  logs: LogRow[];
  projects: ProjectOption[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [editing, setEditing] = useState<LogRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [, startTransition] = useTransition();

  const shown = scope === "mine" ? logs.filter((l) => l.authorId === currentUserId) : logs;

  function onDelete(id: string) {
    if (!confirm("确认删除该日志？删除后进入回收站，7 天内可恢复。")) return;
    startTransition(async () => {
      await softDeleteWorkLog(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="工作日志"
        description="周报 / 月报记录，可关联项目并从项目时间流自动拉取进度，支持 AI 总结优化"
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> 写日志
          </button>
        }
      />

      {/* 范围切换 */}
      <div className="flex gap-1.5">
        {([
          { key: "mine", label: `我的日志（${logs.filter((l) => l.authorId === currentUserId).length}）` },
          { key: "all", label: `全部日志（${logs.length}）` },
        ] as const).map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              scope === s.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 日志时间流 */}
      {shown.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">暂无工作日志</p>
          <p className="mt-1 text-xs text-slate-400">点击右上角「写日志」记录本周期工作进度</p>
        </div>
      ) : (
        <div className="relative space-y-0 pl-5">
          <span className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" />
          {shown.map((l) => {
            const canManage = l.authorId === currentUserId || isAdmin;
            return (
              <div key={l.id} className="relative pb-5 pl-5">
                <span className={`absolute left-[-17px] top-1.5 h-3 w-3 rounded-full border-2 border-white shadow ${l.period === "MONTHLY" ? "bg-violet-500" : "bg-brand-500"}`} />
                <div className="card p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-slate-800">{l.authorName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${l.period === "MONTHLY" ? "bg-violet-50 text-violet-600" : "bg-brand-50 text-brand-700"}`}>
                      {l.period === "MONTHLY" ? "月报" : "周报"}
                    </span>
                    {l.workTypes.map((t) => (
                      <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{t}</span>
                    ))}
                    <span className="ml-auto text-slate-400">{formatDateTime(l.logDate)}</span>
                    {canManage && (
                      <span className="flex gap-1">
                        <button onClick={() => setEditing(l)} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => onDelete(l.id)} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>
                  {l.projectNames.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {l.projectIds.map((pid, i) => (
                        <Link key={pid} href={`/projects/${pid}`}
                          className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600 hover:underline">
                          {l.projectNames[i]}
                        </Link>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{l.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showCreate || editing) && (
        <WorkLogFormModal
          projects={projects}
          log={editing}
          onClose={() => { setShowCreate(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ── 写日志 / 编辑日志弹窗 ─────────────────────────────────────────────────────

function WorkLogFormModal({
  projects,
  log,
  onClose,
}: {
  projects: ProjectOption[];
  log: LogRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!log;

  const [period, setPeriod] = useState<"WEEKLY" | "MONTHLY">((log?.period as "WEEKLY" | "MONTHLY") ?? "WEEKLY");
  const [projectIds, setProjectIds] = useState<string[]>(log?.projectIds ?? []);
  const [workTypes, setWorkTypes] = useState<string[]>(log?.workTypes ?? []);
  const [content, setContent] = useState(log?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "pull" | "ai">("");
  const [undoContent, setUndoContent] = useState<string | null>(null);

  const toggleProject = (id: string) =>
    setProjectIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  const toggleType = (t: string) =>
    setWorkTypes((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));

  // 从项目拉取本周期工作进度
  async function pullFromProjects() {
    if (!projectIds.length) { setNote("请先勾选关联项目"); return; }
    setBusy("pull");
    setNote(null);
    try {
      const result = await fetchProjectProgress(projectIds, period);
      if (!result.count) {
        setNote(`所选项目在${period === "MONTHLY" ? "近 30 天" : "近 7 天"}内暂无进度记录`);
        return;
      }
      const ok = confirm(`从项目拉取到 ${result.count} 条进度，填充到工作进度中？\n（追加到现有内容之后）`);
      if (ok) {
        setContent((c) => (c.trim() ? c.trimEnd() + "\n\n" : "") + result.text);
        setNote(`✅ 已填充 ${result.count} 条项目进度`);
      }
    } finally {
      setBusy("");
    }
  }

  // AI 总结优化
  async function aiSummarize() {
    if (!content.trim()) { setNote("请先填写或拉取工作进度内容"); return; }
    setBusy("ai");
    setNote(null);
    try {
      const res = await fetch("/api/worklogs/ai-summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, period }),
      });
      const data = await res.json();
      if (!res.ok) { setNote(data.error ?? "AI 总结失败"); return; }
      setUndoContent(content);
      setContent(data.content);
      setNote("✅ AI 已总结优化，不满意可点「撤销」还原");
    } catch {
      setNote("AI 总结失败，请重试");
    } finally {
      setBusy("");
    }
  }

  function undoAI() {
    if (undoContent !== null) {
      setContent(undoContent);
      setUndoContent(null);
      setNote("已还原 AI 优化前的内容");
    }
  }

  function onSubmit() {
    setError(null);
    const payload: WorkLogPayload = { period, projectIds, workTypes, content };
    startTransition(async () => {
      const result = isEdit ? await updateWorkLog(log!.id, payload) : await createWorkLog(payload);
      if (!result.ok) { setError(result.error ?? "保存失败"); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">{isEdit ? "编辑日志" : "写日志"}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          {/* 日志时间（自动）+ 周期 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">日志时间（自动生成）</label>
              <div className="input bg-slate-50 text-slate-600 cursor-not-allowed">
                {formatDateTime(log?.logDate ?? new Date().toISOString())}
              </div>
            </div>
            <div>
              <label className="label">日志周期</label>
              <div className="flex gap-2">
                {([
                  { key: "WEEKLY", label: "周报" },
                  { key: "MONTHLY", label: "月报" },
                ] as const).map((p) => (
                  <label key={p.key}
                    className={cn(
                      "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm",
                      period === p.key
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300",
                    )}>
                    <input type="radio" className="hidden" checked={period === p.key} onChange={() => setPeriod(p.key)} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* 关联项目 */}
          <div>
            <label className="label">关联项目（可多选）</label>
            {projects.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-400">
                暂无项目，可先在「项目管理」中创建
              </p>
            ) : (
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                {projects.map((p) => (
                  <label key={p.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
                      projectIds.includes(p.id)
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300",
                    )}>
                    <input type="checkbox" className="hidden"
                      checked={projectIds.includes(p.id)} onChange={() => toggleProject(p.id)} />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 工作内容 */}
          <div>
            <label className="label">工作内容（可多选）*</label>
            <div className="flex gap-2">
              {WORK_TYPE_OPTIONS.map((t) => (
                <label key={t}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm",
                    workTypes.includes(t)
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300",
                  )}>
                  <input type="checkbox" className="hidden" checked={workTypes.includes(t)} onChange={() => toggleType(t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>

          {/* 具体工作进度 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label mb-0">具体工作进度 *</label>
              <div className="flex gap-1.5">
                <button type="button" onClick={pullFromProjects} disabled={busy !== ""}
                  className="btn-secondary btn-sm" title="按所选周期从关联项目时间流拉取进度">
                  <Download className="h-3.5 w-3.5" />
                  {busy === "pull" ? "拉取中…" : "从项目拉取"}
                </button>
                {undoContent !== null && (
                  <button type="button" onClick={undoAI} className="btn-secondary btn-sm">
                    <Undo2 className="h-3.5 w-3.5" /> 撤销
                  </button>
                )}
                <button type="button" onClick={aiSummarize} disabled={busy !== ""}
                  className="btn-primary btn-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  {busy === "ai" ? "AI 处理中…" : "AI 总结优化"}
                </button>
              </div>
            </div>
            <textarea
              className="input min-h-[180px] text-sm"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`记录${period === "MONTHLY" ? "本月" : "本周"}工作进度…\n也可以勾选关联项目后点「从项目拉取」自动填充，再用「AI 总结优化」润色`}
            />
            {note && (
              <p className={`mt-1.5 text-xs ${note.startsWith("✅") ? "text-emerald-600" : "text-slate-500"}`}>{note}</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{error}</div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button onClick={onSubmit} disabled={pending} className="btn-primary text-sm">
              {pending ? "保存中…" : isEdit ? "保存修改" : "提交日志"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
