import Link from "next/link";
import { Users, KanbanSquare, FileText, Bell, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  TASK_STATUS_LABELS,
  labelOf,
} from "@/lib/constants";
import { formatDate, daysUntil } from "@/lib/utils";
import { runCustomerStatusChecks, parseStringArray } from "@/lib/customer";
import {
  customerScope,
  contractScope,
  taskScope,
  isStaff,
  parseViewScope,
} from "@/lib/dataScope";
import { ScopeToggle } from "@/components/ScopeToggle";

export const metadata = { title: "工作台 · Thraive联盟营销系统" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  // 仅内部员工才跑全局客户状态自动校验
  if (isStaff(session.role)) await runCustomerStatusChecks();

  // 行级权限过滤
  const sessForScope = {
    userId: session.userId,
    role: session.role,
    brandName: session.brandName,
  };
  const view = parseViewScope(sp);
  const custWhere = customerScope(sessForScope, view);
  const contractWhere = contractScope(sessForScope, view);
  const taskWhere = taskScope(sessForScope, view);

  const [
    customerCount,
    activeTaskCount,
    contractCount,
    unreadCount,
    recentCustomers,
    urgentTasks,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.customer.count({ where: custWhere as any }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.task.count({
      where: {
        AND: [
          { status: { in: ["TODO", "IN_PROGRESS"] } },
          taskWhere as any,
        ],
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.contract.count({ where: contractWhere as any }),
    prisma.reminder.count({
      where: { targetId: session.userId, isRead: false },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.customer.findMany({
      where: custWhere as any,
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { businessOwner: true },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.task.findMany({
      where: {
        AND: [
          {
            status: { not: "DONE" },
            priority: { in: ["HIGH", "URGENT"] },
          },
          taskWhere as any,
        ],
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 8,
      include: { customer: true, owner: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <PageHeader
          title={`欢迎回来，${session.name}`}
          description={
            isStaff(session.role)
              ? view === "all"
                ? "全部数据视图"
                : "默认仅显示与你相关的数据，可切换到「全部」查看系统所有数据"
              : "你的数据快览"
          }
        />
        {isStaff(session.role) && <ScopeToggle />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="客户总数"
          value={customerCount}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="进行中任务"
          value={activeTaskCount}
          accent="text-amber-600"
          icon={<KanbanSquare className="h-5 w-5" />}
        />
        <StatCard
          label="合同数量"
          value={contractCount}
          accent="text-indigo-600"
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label="未读提醒"
          value={unreadCount}
          accent="text-rose-600"
          icon={<Bell className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">最近客户</h2>
            <Link
              href="/customers"
              className="flex items-center gap-1 text-sm text-brand-600 hover:underline"
            >
              查看全部 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recentCustomers.length === 0 ? (
            <EmptyState title="暂无客户" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentCustomers.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/customers/${c.id}`}
                    className="flex items-center justify-between py-3 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {c.brandName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {parseStringArray(c.mainSites).join(" / ") || "—"} ·
                        负责人 {c.businessOwner?.name ?? "未分配"}
                      </p>
                    </div>
                    <Badge className={CUSTOMER_STATUS_COLORS[c.status]}>
                      {labelOf(CUSTOMER_STATUS_LABELS, c.status)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">紧急待办任务</h2>
            <Link
              href="/tasks"
              className="flex items-center gap-1 text-sm text-brand-600 hover:underline"
            >
              查看看板 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {urgentTasks.length === 0 ? (
            <EmptyState title="暂无紧急任务" description="所有高优先级任务都已处理" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {urgentTasks.map((t) => {
                const dleft = daysUntil(t.dueDate);
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {t.title}
                      </p>
                      <p className="text-xs text-slate-400">
                        {t.customer?.brandName ?? "无关联品牌"} ·{" "}
                        {labelOf(TASK_STATUS_LABELS, t.status)} ·{" "}
                        {t.owner?.name ?? "未分配"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {dleft != null && (
                        <span
                          className={`text-xs ${
                            dleft < 0
                              ? "text-rose-600"
                              : dleft <= 2
                                ? "text-amber-600"
                                : "text-slate-400"
                          }`}
                        >
                          {dleft < 0
                            ? `逾期 ${-dleft} 天`
                            : dleft === 0
                              ? "今天截止"
                              : `${dleft} 天后`}
                        </span>
                      )}
                      <Badge className={TASK_PRIORITY_COLORS[t.priority]}>
                        {labelOf(TASK_PRIORITY_LABELS, t.priority)}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        数据更新于 {formatDate(new Date())}
      </p>
    </div>
  );
}
