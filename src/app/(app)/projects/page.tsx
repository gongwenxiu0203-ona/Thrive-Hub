import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { creationReferenceCustomerScope, projectScope } from "@/lib/dataScope";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import ProjectsClient from "./ProjectsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "项目管理 · Thraive联盟营销系统" };

export default async function ProjectsPage() {
  const session = await requireSession();
  const permission = await resolveUserPermission(session.userId, "projects.records");
  if (!hasPermissionLevel(permission, "READ")) redirect("/dashboard");
  const scopeSession = { userId: session.userId, role: session.role };
  const view = hasPermissionLevel(permission, "MANAGE") ? "all" : "mine";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [projects, completedContracts] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.project.findMany as any)({
      where: { deletedAt: null, ...projectScope(scopeSession, view) },
      include: {
        customer: {
          select: {
            id: true,
            brandName: true,
            businessOwner: { select: { name: true } },
            backendOwner: { select: { name: true } },
          },
        },
        contract: { select: { id: true, contractNo: true } },
        createdBy: { select: { name: true } },
        owner: { select: { name: true } },
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // 可关联的合同：签署完成的合同（一个客户可多项目，不再限制一合同一项目）
    prisma.contract.findMany({
      where: {
        status: "COMPLETED",
        deletedAt: null,
        customerId: { not: null },
        customer: { deletedAt: null, ...creationReferenceCustomerScope(scopeSession) },
      },
      select: {
        id: true,
        contractNo: true,
        customerId: true,
        customer: { select: { brandName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // 关联客户（含商务负责人，自动带出）+ Strategy AM 候选用户
  const [customers, users] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null, ...creationReferenceCustomerScope(scopeSession) },
      select: { id: true, brandName: true, businessOwner: { select: { name: true } } },
      orderBy: { brandName: "asc" },
    }),
    prisma.user.findMany({
      where: { status: "APPROVED", role: { in: ["ADMIN", "USER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // 所有签署完成的合同都可关联（一客户多项目，不再排除已用）
  const availableContracts = completedContracts.flatMap((c) => {
    if (!c.customer || !c.customerId) return [];
    return [{
      id: c.id,
      contractNo: c.contractNo,
      brandName: c.customer.brandName,
      customerId: c.customerId,
    }];
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (projects as any[]).map((p) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    status: p.status,
    stage: p.stage ?? null,
    customerName: p.customer?.brandName ?? "—",
    ownerName: p.owner?.name ?? "—",
    businessOwner: p.customer?.businessOwner?.name ?? "—",
    backendOwner: p.customer?.backendOwner?.name ?? "—",
    contractNo: p.contract?.contractNo ?? "—",
    createdBy: p.createdBy?.name ?? "—",
    entryCount: p._count?.entries ?? 0,
    createdAt: p.createdAt.toISOString(),
  }));

  const customerOptions = customers.map((c) => ({
    id: c.id,
    brandName: c.brandName,
    businessOwnerName: c.businessOwner?.name ?? undefined,
  }));

  return (
    <ProjectsClient
      projects={rows}
      availableContracts={availableContracts}
      customers={customerOptions}
      users={users}
      currentUserId={session.userId}
      canEdit={hasPermissionLevel(permission, "EDIT")}
    />
  );
}
