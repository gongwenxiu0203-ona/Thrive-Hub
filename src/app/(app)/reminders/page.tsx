import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar, SearchFilter } from "@/components/ui/Filters";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import { REMINDER_TYPE_LABELS } from "@/lib/constants";
import { ReminderFormModal } from "./ReminderFormModal";
import { ReminderItem } from "./ReminderItem";
import { MarkAllReadButton } from "./MarkAllReadButton";

export const metadata = { title: "提醒管理 · Thraive联盟营销系统" };

function csv(sp: Record<string, string | undefined>, key: string): string[] {
  return (sp[key] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const typeFilter = csv(sp, "type");
  const scopeFilter = csv(sp, "scope");
  const readFilter = csv(sp, "read");
  const q = sp.q?.trim() ?? "";

  // Build base where clause
  const isCreatedScope = scopeFilter.includes("created") && !scopeFilter.includes("received");
  const baseWhere = isCreatedScope
    ? { createdById: session.userId, deletedAt: null }
    : { targetId: session.userId, deletedAt: null };

  const [allReminders, users, unreadCount] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.reminder.findMany({
      where: baseWhere as any,
      orderBy: [{ isRead: "asc" }, { remindDate: "asc" }],
      include: { target: true, createdBy: true },
    }),
    prisma.user.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.reminder.count({ where: { targetId: session.userId, isRead: false, deletedAt: null } as any }),
  ]);

  const reminders = allReminders.filter((r) => {
    if (typeFilter.length && !typeFilter.includes(r.type)) return false;
    if (readFilter.length) {
      const wantUnread = readFilter.includes("unread");
      const wantRead = readFilter.includes("read");
      if (wantUnread && !wantRead && r.isRead) return false;
      if (wantRead && !wantUnread && !r.isRead) return false;
    }
    if (q) {
      const ql = q.toLowerCase();
      if (!r.title.toLowerCase().includes(ql) && !(r.content?.toLowerCase().includes(ql))) return false;
    }
    return true;
  });

  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));
  const typeOptions = Object.entries(REMINDER_TYPE_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="提醒管理"
        description="设置关键节点提醒，到期通知相关人员"
        actions={
          <>
            {unreadCount > 0 && <MarkAllReadButton count={unreadCount} />}
            <ReminderFormModal users={userOptions} />
          </>
        }
      />

      <FilterBar>
        <SearchFilter placeholder="搜索提醒标题 / 内容" />
        <MultiSelectFilter
          paramKey="scope"
          placeholder="发给我的"
          options={[
            { value: "received", label: "发给我的" },
            { value: "created", label: "我创建的" },
          ]}
        />
        <MultiSelectFilter paramKey="type" placeholder="全部类型" options={typeOptions} />
        <MultiSelectFilter
          paramKey="read"
          placeholder="全部状态"
          options={[
            { value: "unread", label: "未读" },
            { value: "read", label: "已读" },
          ]}
        />
      </FilterBar>

      {unreadCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-2.5 text-sm text-brand-700">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {unreadCount}
          </span>
          条未读提醒
        </div>
      )}

      {reminders.length === 0 ? (
        <EmptyState title="暂无提醒" description="点击右上角新建提醒" />
      ) : (
        <div className="space-y-2">
          {reminders.map((r) => (
            <ReminderItem
              key={r.id}
              reminder={{
                id: r.id,
                title: r.title,
                content: r.content,
                remindDate: r.remindDate.toISOString(),
                type: r.type,
                targetId: r.targetId,
                isRead: r.isRead,
              }}
              targetName={r.target.name}
              creatorName={r.createdBy.name}
              canManage={r.createdById === session.userId || session.role === "ADMIN"}
              users={userOptions}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        共 {reminders.length} / {allReminders.length} 条提醒
      </p>
    </div>
  );
}
