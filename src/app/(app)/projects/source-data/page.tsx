import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { projectScope } from "@/lib/dataScope";
import SourceDataClient from "./SourceDataClient";
export default async function ProjectSourceDataPage() { const session = await requireSession(); const projects = await prisma.project.findMany({ where: { deletedAt: null, ...projectScope({ userId: session.userId, role: session.role }, session.role === "ADMIN" ? "all" : "mine") }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }); return <SourceDataClient projects={projects}/>; }
