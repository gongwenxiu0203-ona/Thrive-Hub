"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarClock, User as UserIcon } from "lucide-react";
import { moveTask } from "@/actions/tasks";
import type { AttachmentItem } from "@/components/FileUploader";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  TASK_CATEGORY_LABELS,
  labelOf,
} from "@/lib/constants";
import { formatDate, daysUntil, cn } from "@/lib/utils";
import { TaskDetailModal, type TaskDetail } from "./TaskDetailModal";

export type KanbanTask = TaskDetail;
type Option = { id: string; name: string };

const COLUMN_ACCENT: Record<string, string> = {
  TODO: "border-t-slate-400",
  IN_PROGRESS: "border-t-sky-500",
  REVIEW: "border-t-amber-500",
  DONE: "border-t-emerald-500",
};

function TaskCard({
  task,
  onOpen,
  dragging,
}: {
  task: KanbanTask;
  onOpen: () => void;
  dragging?: boolean;
}) {
  const dleft = daysUntil(task.dueDate);
  return (
    <div
      onClick={onOpen}
      className={cn(
        "cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md",
        dragging && "rotate-2 opacity-90 shadow-lg",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{task.title}</p>
        <span
          className={cn("badge shrink-0", TASK_PRIORITY_COLORS[task.priority])}
        >
          {labelOf(TASK_PRIORITY_LABELS, task.priority)}
        </span>
      </div>
      {task.customerName && (
        <p className="mb-1 text-xs text-brand-600">{task.customerName}</p>
      )}
      <p className="mb-2 text-xs text-slate-400">
        {labelOf(TASK_CATEGORY_LABELS, task.category)}
      </p>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <UserIcon className="h-3 w-3" />
          {task.ownerName ?? "未分配"}
        </span>
        {task.dueDate && (
          <span
            className={cn(
              "flex items-center gap-1",
              dleft != null && dleft < 0
                ? "text-rose-600"
                : dleft != null && dleft <= 2
                  ? "text-amber-600"
                  : "",
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  task,
  onOpen,
}: {
  task: KanbanTask;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? "opacity-30" : ""}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}

function Column({
  status,
  tasks,
  onOpen,
}: {
  status: string;
  tasks: KanbanTask[];
  onOpen: (t: KanbanTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div
        className={cn(
          "mb-3 flex items-center justify-between rounded-lg border-t-4 bg-white px-3 py-2 shadow-sm",
          COLUMN_ACCENT[status],
        )}
      >
        <span className="text-sm font-semibold text-slate-700">
          {labelOf(TASK_STATUS_LABELS, status)}
        </span>
        <span className="badge bg-slate-100 text-slate-500">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-lg p-2 transition-colors",
          isOver ? "bg-brand-50" : "bg-slate-100/60",
        )}
      >
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={() => onOpen(t)} />
        ))}
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-slate-400">
            拖拽任务到此列
          </p>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  initialTasks,
  users,
  attachmentsByTask,
  initialOpenId,
}: {
  initialTasks: KanbanTask[];
  users: Option[];
  attachmentsByTask: Record<string, AttachmentItem[]>;
  initialOpenId?: string | null;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<KanbanTask[]>(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(
    initialOpenId && initialTasks.some((t) => t.id === initialOpenId)
      ? initialOpenId
      : null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const grouped: Record<string, KanbanTask[]> = {};
  for (const s of TASK_STATUS_ORDER) grouped[s] = [];
  for (const t of tasks) {
    if (grouped[t.status]) grouped[t.status].push(t);
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskId = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const toStatus = TASK_STATUS_ORDER.includes(over) ? over : task.status;
    if (toStatus === task.status) return;

    const next = tasks.map((t) =>
      t.id === taskId ? { ...t, status: toStatus } : t,
    );
    setTasks(next);
    const orderedIds = next
      .filter((t) => t.status === toStatus)
      .map((t) => t.id);
    try {
      await moveTask(taskId, toStatus, orderedIds);
      router.refresh();
    } catch {
      setTasks(tasks);
    }
  }

  const activeTask = tasks.find((t) => t.id === activeId) ?? null;
  const openTask = tasks.find((t) => t.id === openId) ?? null;

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {TASK_STATUS_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={grouped[status] ?? []}
              onOpen={(t) => setOpenId(t.id)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <TaskCard task={activeTask} onOpen={() => {}} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {openTask && (
        <TaskDetailModal
          task={openTask}
          users={users}
          attachments={attachmentsByTask[openTask.id] ?? []}
          open={!!openTask}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
