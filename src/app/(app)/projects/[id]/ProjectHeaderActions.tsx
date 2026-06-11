"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { updateProjectStatus, softDeleteProject } from "@/actions/projects";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "进行中" },
  { value: "PAUSED", label: "已暂停" },
  { value: "DONE", label: "已完成" },
  { value: "CANCELLED", label: "已终止" },
];

export function ProjectHeaderActions({ projectId, status }: { projectId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onStatusChange(next: string) {
    startTransition(async () => {
      await updateProjectStatus(projectId, next);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm("确认删除该项目？删除后进入回收站，7 天内可恢复。")) return;
    startTransition(async () => {
      await softDeleteProject(projectId);
      router.push("/projects");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded-lg border-0 bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm [&>option]:text-slate-800"
        value={status}
        disabled={pending}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        onClick={onDelete}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm hover:bg-rose-500/80"
      >
        <Trash2 className="h-4 w-4" /> 删除
      </button>
    </div>
  );
}
