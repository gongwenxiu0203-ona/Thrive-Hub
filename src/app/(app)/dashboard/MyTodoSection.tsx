import Link from "next/link";
import {
  ArrowRight, KanbanSquare, FileCheck2, FileWarning, Stamp, Receipt, FolderKanban,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";

/** 我的待办：聚合任务/合同/财务/项目多源 TODO，按数量分组展示。 */
export async function MyTodoSection() {
  const session = await requireSession();
  if (!isStaff(session.role)) return null;

  const [
    myTasks,
    contractsToReview,
    contractsRejected,
    contractsToStamp,
    reconciliationsToHandle,
    projectsToFollow,
  ] = await Promise.all([
    // 我的任务（未完成 + 我是 owner 或 publisher）
    prisma.task.findMany({
      where: {
        deletedAt: null,
        status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] },
        OR: [{ ownerId: session.userId }, { publisherId: session.userId }],
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 5,
      include: { customer: { select: { brandName: true } } },
    }),
    // 合同待审核：我作为 reviewer 的轮次 PENDING
    prisma.contractReview.findMany({
      where: { reviewerId: session.userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { contract: { select: { id: true, contractNo: true, customer: { select: { brandName: true } } } } },
    }),
    // 合同被驳回：我是 owner/创建人，状态 = REJECTED
    prisma.contract.findMany({
      where: {
        deletedAt: null,
        status: "REJECTED",
        OR: [{ ownerId: session.userId }, { createdById: session.userId }],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { customer: { select: { brandName: true } } },
    }),
    // 待盖章合同：我是 owner，状态 = SIGNING（待盖章）
    prisma.contract.findMany({
      where: {
        deletedAt: null,
        status: "SIGNING",
        OR: [{ ownerId: session.userId }, { createdById: session.userId }],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { customer: { select: { brandName: true } } },
    }),
    // 财务待处理：提交给我审核 + 草稿/审核中/有异议
    prisma.customerReconciliation.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PENDING_REVIEW", "DISPUTED"] },
        OR: [
          { submittedToUserId: session.userId },
          { customer: { backendOwnerId: session.userId } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { customer: { select: { brandName: true } } },
    }),
    // 项目待跟进：我作为 owner 且 ACTIVE
    prisma.project.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        OR: [{ ownerId: session.userId }, { customer: { backendOwnerId: session.userId } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { customer: { select: { brandName: true } } },
    }),
  ]);

  const totalCount =
    myTasks.length + contractsToReview.length + contractsRejected.length +
    contractsToStamp.length + reconciliationsToHandle.length + projectsToFollow.length;

  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        🎉 当前没有待办事项
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TodoCard
        title="我的任务"
        count={myTasks.length}
        href="/tasks"
        icon={<KanbanSquare className="h-4 w-4" />}
        color="text-amber-600"
        items={myTasks.map((t) => ({
          id: t.id,
          label: t.title,
          sub: t.customer?.brandName ?? "—",
          href: `/tasks`,
        }))}
      />
      <TodoCard
        title="合同待审核"
        count={contractsToReview.length}
        href="/contracts/reviews"
        icon={<FileCheck2 className="h-4 w-4" />}
        color="text-indigo-600"
        items={contractsToReview.map((r) => ({
          id: r.id,
          label: r.contract.contractNo,
          sub: `${r.contract.customer?.brandName ?? "—"} · 第 ${r.round} 轮`,
          href: `/contracts/${r.contract.id}`,
        }))}
      />
      <TodoCard
        title="合同被驳回"
        count={contractsRejected.length}
        href="/contracts"
        icon={<FileWarning className="h-4 w-4" />}
        color="text-rose-600"
        items={contractsRejected.map((c) => ({
          id: c.id,
          label: c.contractNo,
          sub: c.customer?.brandName ?? "—",
          href: `/contracts/${c.id}`,
        }))}
      />
      <TodoCard
        title="待盖章合同"
        count={contractsToStamp.length}
        href="/contracts"
        icon={<Stamp className="h-4 w-4" />}
        color="text-sky-600"
        items={contractsToStamp.map((c) => ({
          id: c.id,
          label: c.contractNo,
          sub: c.customer?.brandName ?? "—",
          href: `/contracts/${c.id}`,
        }))}
      />
      <TodoCard
        title="财务待处理"
        count={reconciliationsToHandle.length}
        href="/finance"
        icon={<Receipt className="h-4 w-4" />}
        color="text-emerald-600"
        items={reconciliationsToHandle.map((r) => ({
          id: r.id,
          label: r.customer?.brandName ?? "—",
          sub: r.status,
          href: `/finance/reconciliations/${r.id}`,
        }))}
      />
      <TodoCard
        title="项目待跟进"
        count={projectsToFollow.length}
        href="/projects"
        icon={<FolderKanban className="h-4 w-4" />}
        color="text-brand-600"
        items={projectsToFollow.map((p) => ({
          id: p.id,
          label: p.name,
          sub: p.customer?.brandName ?? "—",
          href: `/projects/${p.id}`,
        }))}
      />
    </div>
  );
}

function TodoCard({
  title, count, href, icon, color, items,
}: {
  title: string;
  count: number;
  href: string;
  icon: React.ReactNode;
  color: string;
  items: { id: string; label: string; sub: string; href: string }[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${color}`}>
          {icon}
          {title}
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{count}</span>
        </div>
        <Link href={href} className="text-[11px] text-slate-500 hover:text-brand-700 inline-flex items-center gap-0.5">
          全部 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-center text-xs text-slate-400">无</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={it.href} className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-slate-50">
                <span className="truncate font-medium text-slate-700">{it.label}</span>
                <span className="ml-2 truncate text-[10px] text-slate-400">{it.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
