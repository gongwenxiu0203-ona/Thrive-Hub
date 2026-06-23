import Link from "next/link";
import { ArrowRight, KanbanSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS, labelOf } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { daysUntil } from "@/lib/utils";

/** "我的任务" tab：按状态分组展示当前用户的任务，含跳转完整看板入口。 */
export async function MyTasksTab() {
  const session = await requireSession();
  if (!isStaff(session.role)) return null;

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      OR: [{ ownerId: session.userId }, { publisherId: session.userId }],
    },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { dueDate: "asc" }],
    take: 30,
    include: { customer: { select: { brandName: true } } },
  });

  const byStatus: Record<string, typeof tasks> = {
    TODO: [],
    IN_PROGRESS: [],
    REVIEW: [],
    DONE: [],
  };
  for (const t of tasks) {
    if (byStatus[t.status]) byStatus[t.status].push(t);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-600">
          <KanbanSquare className="h-4 w-4" />
          <p className="text-sm font-semibold">我的任务摘要</p>
          <span className="text-xs text-slate-400">· 共 {tasks.length} 条</span>
        </div>
        <Link href="/tasks" className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
          查看完整看板 <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          当前没有分配给你的任务
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-4">
          {(["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const).map((s) => (
            <div key={s} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">{labelOf(TASK_STATUS_LABELS, s)}</p>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{byStatus[s].length}</span>
              </div>
              {byStatus[s].length === 0 ? (
                <p className="py-2 text-center text-[11px] text-slate-400">无</p>
              ) : (
                <ul className="space-y-1.5">
                  {byStatus[s].slice(0, 5).map((t) => {
                    const dleft = daysUntil(t.dueDate);
                    return (
                      <li key={t.id} className="rounded bg-slate-50/60 px-2 py-1.5">
                        <p className="truncate text-xs font-medium text-slate-800">{t.title}</p>
                        <div className="mt-0.5 flex items-center justify-between text-[10px]">
                          <span className="truncate text-slate-500">{t.customer?.brandName ?? "—"}</span>
                          <div className="flex items-center gap-1">
                            {dleft != null && (
                              <span className={
                                dleft < 0 ? "text-rose-600"
                                  : dleft <= 2 ? "text-amber-600"
                                    : "text-slate-400"
                              }>
                                {dleft < 0 ? `逾期${-dleft}天` : dleft === 0 ? "今天" : `${dleft}天`}
                              </span>
                            )}
                            <Badge className={TASK_PRIORITY_COLORS[t.priority]}>
                              {labelOf(TASK_PRIORITY_LABELS, t.priority)}
                            </Badge>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {byStatus[s].length > 5 && (
                    <li className="text-center text-[10px] text-slate-400">还有 {byStatus[s].length - 5} 条</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
