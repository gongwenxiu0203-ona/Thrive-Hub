import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import WorkLogsClient from "./WorkLogsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "工作日志 · Thraive联盟营销系统" };

export default async function WorkLogsPage() {
  const session = await requireSession();
  const permission = await resolveUserPermission(session.userId, "worklogs.records");
  if (!hasPermissionLevel(permission, "READ")) redirect("/dashboard");
  const canManage = hasPermissionLevel(permission, "MANAGE");

  const [logs, projects, affiliates] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.workLog.findMany as any)({
      where: {
        deletedAt: null,
        ...(canManage ? {} : { authorId: session.userId }),
      },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { logDate: "desc" },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.project.findMany as any)({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.affiliate.findMany({
      where: { deletedAt: null },
      select: { id: true, platformAffiliateName: true },
      orderBy: { platformAffiliateName: "asc" },
    }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectMap = new Map((projects as any[]).map((p) => [p.id, p.name]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (logs as any[]).map((l) => {
    let pids: string[] = [];
    let types: string[] = [];
    let bd: { affiliateId: string; affiliateName: string; progress: string }[] = [];
    try { pids = JSON.parse(l.projectIds); } catch {}
    try { types = JSON.parse(l.workTypes); } catch {}
    try { bd = JSON.parse(l.bdProgress ?? "[]"); } catch {}
    return {
      id: l.id,
      authorId: l.author?.id ?? "",
      authorName: l.author?.name ?? "—",
      period: l.period,
      projectIds: pids,
      projectNames: pids.map((id) => projectMap.get(id) ?? "已删除项目"),
      workTypes: types,
      content: l.content,
      bdProgress: bd,
      logDate: l.logDate.toISOString(),
    };
  });

  return (
    <WorkLogsClient
      logs={rows}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projects={(projects as any[]).map((p) => ({ id: p.id, name: p.name }))}
      affiliates={affiliates.map((a) => ({ id: a.id, name: a.platformAffiliateName }))}
      currentUserId={session.userId}
      isAdmin={session.role === "ADMIN"}
      canEdit={hasPermissionLevel(permission, "EDIT")}
      canManage={canManage}
    />
  );
}
