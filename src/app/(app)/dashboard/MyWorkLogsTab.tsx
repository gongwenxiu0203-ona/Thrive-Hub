import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { QuickWorkLogForm } from "./QuickWorkLogForm";

/** "工作日志" tab：左边快速写日志 + 右边最近 5 条日志。 */
export async function MyWorkLogsTab() {
  const session = await requireSession();
  if (!isStaff(session.role)) return null;

  const logs = await prisma.workLog.findMany({
    where: { authorId: session.userId, deletedAt: null },
    orderBy: { logDate: "desc" },
    take: 5,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center gap-2 text-slate-600">
          <BookOpen className="h-4 w-4" />
          <p className="text-sm font-semibold">快速写日志</p>
        </div>
        <QuickWorkLogForm />
        <p className="mt-2 text-[11px] text-slate-400">
          只支持「项目管理」类工作进度的快速记录；BD 联盟商进度、关联项目、详细内容请到完整日志页填写。
        </p>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-600">
            <BookOpen className="h-4 w-4" />
            <p className="text-sm font-semibold">最近日志</p>
            <span className="text-xs text-slate-400">· 最近 {logs.length} 条</span>
          </div>
          <Link href="/worklogs" className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
            查看完整日志 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
            还没有写过日志，左侧快速记录一条。
          </div>
        ) : (
          <ul className="space-y-2">
            {logs.map((l) => (
              <li key={l.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                    {l.period === "WEEKLY" ? "周报" : "月报"}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatDateTime(l.logDate)}</span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-xs text-slate-700">{l.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
