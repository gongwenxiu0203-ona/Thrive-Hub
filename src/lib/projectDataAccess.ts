import { prisma } from "@/lib/prisma";
import { projectScope, type ViewScope } from "@/lib/dataScope";
import { requireFeaturePermission, resolveSafeViewScope } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";

export async function requireProjectDataAccess(
  projectId: string,
  level: "READ" | "EDIT" | "MANAGE",
  feature = "projects.records",
) {
  const session = await requireSession();
  const permission = await requireFeaturePermission(session, feature, level);
  const view = await resolveSafeViewScope(session, feature, "all", permission) as ViewScope;
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null, ...projectScope(session, view) }, select: { id: true, name: true } });
  if (!project) throw new Error("项目不存在或无权访问。");
  return { session, project };
}

export function safeJson(value: unknown, max = 100_000) {
  const text = JSON.stringify(value ?? {});
  if (text.length > max) throw new Error("JSON 数据过大。");
  return text;
}

export function dateValue(value: unknown, label: string) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) throw new Error(`${label}格式不正确。`);
  return date;
}
