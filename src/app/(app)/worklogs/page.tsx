import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/permissions";
import WorkLogsClient from "./WorkLogsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "工作日志 · Thraive联盟营销系统" };

export default async function WorkLogsPage() {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/dashboard");

  const [logs, projects] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.workLog.findMany as any)({
      where: { deletedAt: null },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { logDate: "desc" },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.project.findMany as any)({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectMap = new Map((projects as any[]).map((p) => [p.id, p.name]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (logs as any[]).map((l) => {
    let pids: string[] = [];
    let types: string[] = [];
    try { pids = JSON.parse(l.projectIds); } catch {}
    try { types = JSON.parse(l.workTypes); } catch {}
    return {
      id: l.id,
      authorId: l.author?.id ?? "",
      authorName: l.author?.name ?? "—",
      period: l.period,
      projectIds: pids,
      projectNames: pids.map((id) => projectMap.get(id) ?? "已删除项目"),
      workTypes: types,
      content: l.content,
      logDate: l.logDate.toISOString(),
    };
  });

  return (
    <WorkLogsClient
      logs={rows}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projects={(projects as any[]).map((p) => ({ id: p.id, name: p.name }))}
      currentUserId={session.userId}
      isAdmin={session.role === "ADMIN"}
    />
  );
}
