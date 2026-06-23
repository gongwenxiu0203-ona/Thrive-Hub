import Link from "next/link";
import { Activity, UserPlus, FileText, CheckSquare, FolderKanban, BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

/** 今日动态 / 操作记录：聚合过去 7 天内当前用户的关键操作。 */
export async function RecentActivityFeed() {
  const session = await requireSession();
  if (!isStaff(session.role)) return null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [customers, contractReviews, doneTasks, projects, worklogs] = await Promise.all([
    // 我创建的客户
    prisma.customer.findMany({
      where: { createdById: session.userId, deletedAt: null, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, brandName: true, createdAt: true },
    }),
    // 我提交审核的合同（按本人创建的 review round 算）
    prisma.contractReview.findMany({
      where: { contract: { createdById: session.userId }, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { contract: { select: { id: true, contractNo: true } } },
    }),
    // 我完成的任务
    prisma.task.findMany({
      where: { ownerId: session.userId, status: "DONE", updatedAt: { gte: sevenDaysAgo }, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, updatedAt: true },
    }),
    // 我更新的项目（owner 或 createdBy）
    prisma.project.findMany({
      where: {
        deletedAt: null,
        updatedAt: { gte: sevenDaysAgo },
        OR: [{ ownerId: session.userId }, { createdById: session.userId }],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, updatedAt: true },
    }),
    // 我写的工作日志
    prisma.workLog.findMany({
      where: { authorId: session.userId, deletedAt: null, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, period: true, content: true, createdAt: true },
    }),
  ]);

  type Item = { id: string; icon: React.ReactNode; label: string; href: string; when: Date };
  const items: Item[] = [];
  for (const c of customers) items.push({
    id: `customer-${c.id}`,
    icon: <UserPlus className="h-3.5 w-3.5 text-emerald-600" />,
    label: `创建客户「${c.brandName}」`,
    href: `/customers/${c.id}`, when: c.createdAt,
  });
  for (const r of contractReviews) items.push({
    id: `review-${r.id}`,
    icon: <FileText className="h-3.5 w-3.5 text-indigo-600" />,
    label: `提交合同审核 ${r.contract.contractNo}（第 ${r.round} 轮）`,
    href: `/contracts/${r.contract.id}`, when: r.createdAt,
  });
  for (const t of doneTasks) items.push({
    id: `task-${t.id}`,
    icon: <CheckSquare className="h-3.5 w-3.5 text-amber-600" />,
    label: `完成任务「${t.title}」`,
    href: `/tasks`, when: t.updatedAt,
  });
  for (const p of projects) items.push({
    id: `project-${p.id}`,
    icon: <FolderKanban className="h-3.5 w-3.5 text-brand-600" />,
    label: `更新项目「${p.name}」`,
    href: `/projects/${p.id}`, when: p.updatedAt,
  });
  for (const w of worklogs) items.push({
    id: `worklog-${w.id}`,
    icon: <BookOpen className="h-3.5 w-3.5 text-sky-600" />,
    label: `写${w.period === "WEEKLY" ? "周" : "月"}报：${w.content.slice(0, 30)}${w.content.length > 30 ? "…" : ""}`,
    href: `/worklogs`, when: w.createdAt,
  });

  items.sort((a, b) => b.when.getTime() - a.when.getTime());

  return (
    <section className="card mt-6 p-5">
      <div className="mb-4 flex items-center gap-2 text-slate-600">
        <Activity className="h-4 w-4" />
        <h2 className="text-sm font-semibold">最近动态</h2>
        <span className="text-xs text-slate-400">· 过去 7 天</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          过去 7 天还没有动态
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 12).map((it) => (
            <li key={it.id}>
              <Link
                href={it.href}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50"
              >
                {it.icon}
                <span className="flex-1 truncate text-slate-700">{it.label}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{formatDateTime(it.when)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
