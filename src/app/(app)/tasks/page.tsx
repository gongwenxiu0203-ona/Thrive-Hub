import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar, SearchFilter } from "@/components/ui/Filters";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import {
  TASK_PRIORITY_LABELS,
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/constants";
import { parseStringArray } from "@/lib/customer";
import type { AttachmentItem } from "@/components/FileUploader";
import { TaskFormModal } from "./TaskFormModal";
import { KanbanBoard, type KanbanTask } from "./KanbanBoard";

export const metadata = { title: "任务管理 · 联盟营销管理系统" };

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MID: 2,
  LOW: 3,
};

function csv(sp: Record<string, string | undefined>, key: string): string[] {
  return (sp[key] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const ownerFilter = csv(sp, "owner");
  const customerFilter = csv(sp, "customer");
  const priorityFilter = csv(sp, "priority");
  const categoryFilter = csv(sp, "category");
  const statusFilter = csv(sp, "status");
  const q = sp.q?.trim() ?? "";

  // Default: show current user's tasks (unless explicitly cleared with owner=all)
  const defaultToCurrentUser = !sp.owner && sp.owner !== "all";

  const [allTasks, customers, users] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: { customer: true, owner: true, publisher: true },
    }),
    prisma.customer.findMany({ orderBy: { brandName: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Client filtering with multi-select support
  const tasks = allTasks
    .filter((t) => {
      if (defaultToCurrentUser && t.ownerId !== session.userId) return false;
      if (ownerFilter.length && !ownerFilter.includes(t.ownerId ?? "")) return false;
      if (customerFilter.length && !customerFilter.includes(t.customerId ?? "")) return false;
      if (priorityFilter.length && !priorityFilter.includes(t.priority)) return false;
      if (categoryFilter.length && !categoryFilter.includes(t.category)) return false;
      if (statusFilter.length && !statusFilter.includes(t.status)) return false;
      if (q) {
        const ql = q.toLowerCase();
        if (!t.title.toLowerCase().includes(ql) &&
            !(t.customer?.brandName.toLowerCase().includes(ql))) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by due date (overdue first, then soonest), then priority, then sortOrder
      const now = Date.now();
      const aTime = a.dueDate ? a.dueDate.getTime() : Infinity;
      const bTime = b.dueDate ? b.dueDate.getTime() : Infinity;
      if (aTime !== bTime) {
        if (aTime < now && bTime >= now) return -1;
        if (bTime < now && aTime >= now) return 1;
        return aTime - bTime;
      }
      return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
    });

  // Attachments for every visible task, grouped by task id.
  const taskIds = tasks.map((t) => t.id);
  const attachments = taskIds.length
    ? await prisma.attachment.findMany({
        where: { entityType: "TASK", entityId: { in: taskIds } },
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: true },
      })
    : [];
  const attachmentsByTask: Record<string, AttachmentItem[]> = {};
  for (const a of attachments) {
    (attachmentsByTask[a.entityId] ??= []).push({
      id: a.id,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileSize: a.fileSize,
      createdAt: a.createdAt,
      uploadedBy: a.uploadedBy,
    });
  }

  const kanbanTasks: KanbanTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    category: t.category,
    priority: t.priority,
    returnReason: t.returnReason,
    customerName: t.customer?.brandName ?? null,
    ownerName: t.owner?.name ?? null,
    publisherName: t.publisher?.name ?? null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    meetingTime: t.meetingTime ? t.meetingTime.toISOString() : null,
    meetingMode: t.meetingMode,
    meetingLocation: t.meetingLocation,
    attendees: parseStringArray(t.attendees),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    externalLinks: (() => { try { return JSON.parse((t as any).externalLinks ?? "[]"); } catch { return []; } })(),
  }));

  const customerOptions = customers.map((c) => ({ id: c.id, name: c.brandName }));
  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));

  const priorityOptions = Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({ value, label }));
  const categoryOptions = Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
  const statusOptions = Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="任务管理"
        description={
          defaultToCurrentUser
            ? `显示你的任务 · 共 ${tasks.length} 项 — 拖拽卡片切换状态`
            : `共 ${tasks.length} / ${allTasks.length} 项任务`
        }
        actions={
          <div className="flex items-center gap-2">
            {defaultToCurrentUser && (
              <a
                href="/tasks?owner=all"
                className="btn-secondary text-xs"
              >
                查看所有人任务
              </a>
            )}
            <TaskFormModal customers={customerOptions} users={userOptions} />
          </div>
        }
      />

      <FilterBar>
        <SearchFilter placeholder="搜索任务标题 / 品牌" />
        <MultiSelectFilter
          paramKey="owner"
          placeholder="负责人"
          options={userOptions.map((u) => ({ value: u.id, label: u.name }))}
        />
        <MultiSelectFilter
          paramKey="customer"
          placeholder="关联品牌"
          options={customerOptions.map((c) => ({ value: c.id, label: c.name }))}
        />
        <MultiSelectFilter paramKey="priority" placeholder="优先级" options={priorityOptions} />
        <MultiSelectFilter paramKey="category" placeholder="任务类型" options={categoryOptions} />
        <MultiSelectFilter paramKey="status" placeholder="任务状态" options={statusOptions} />
      </FilterBar>

      <KanbanBoard
        initialTasks={kanbanTasks}
        users={userOptions}
        attachmentsByTask={attachmentsByTask}
        initialOpenId={sp.focus ?? null}
      />
    </div>
  );
}
