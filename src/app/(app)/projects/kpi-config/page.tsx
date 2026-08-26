import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { projectScope } from "@/lib/dataScope";
import KpiConfigClient from "./KpiConfigClient";

export default async function ProjectKpiConfigPage() {
  const session = await requireSession();
  const projects = await prisma.project.findMany({ where: { deletedAt: null, ...projectScope({ userId: session.userId, role: session.role }, session.role === "ADMIN" ? "all" : "mine") }, select: { id: true, name: true, ownerId: true, owner: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  const owners = await prisma.user.findMany({ where: { status: "APPROVED", role: { in: ["ADMIN", "USER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return <KpiConfigClient projects={projects.map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId, ownerName: p.owner?.name ?? "" }))} owners={owners} />;
}
