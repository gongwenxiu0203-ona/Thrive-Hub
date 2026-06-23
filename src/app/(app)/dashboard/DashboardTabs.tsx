"use client";

import { useState } from "react";
import { ListTodo, KanbanSquare, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "todos" | "tasks" | "logs";

export function DashboardTabs({
  todosPanel,
  tasksPanel,
  logsPanel,
}: {
  todosPanel: React.ReactNode;
  tasksPanel: React.ReactNode;
  logsPanel: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("todos");
  return (
    <section className="card mt-6 p-5">
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {([
          { key: "todos" as const, label: "我的待办", icon: ListTodo },
          { key: "tasks" as const, label: "我的任务", icon: KanbanSquare },
          { key: "logs", label: "工作日志", icon: BookOpen },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key as Tab)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "todos" && todosPanel}
      {tab === "tasks" && tasksPanel}
      {tab === "logs" && logsPanel}
    </section>
  );
}
