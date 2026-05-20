"use client";

import dynamic from "next/dynamic";
import type { KanbanTask } from "./KanbanBoard";
import type { AttachmentItem } from "@/components/FileUploader";

const KanbanBoard = dynamic(
  () => import("./KanbanBoard").then((m) => ({ default: m.KanbanBoard })),
  {
    ssr: false,
    loading: () => (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100 p-3 h-40 animate-pulse" />
        ))}
      </div>
    ),
  },
);

export function KanbanBoardWrapper(props: {
  initialTasks: KanbanTask[];
  users: { id: string; name: string }[];
  attachmentsByTask: Record<string, AttachmentItem[]>;
  initialOpenId: string | null;
}) {
  return <KanbanBoard {...props} />;
}
