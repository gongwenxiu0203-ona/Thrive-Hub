import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/permissions";
import ProjectsClient from "./ProjectsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "项目管理 · Thraive联盟营销系统" };

export default async function ProjectsPage() {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/dashboard");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [projects, completedContracts] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.project.findMany as any)({
      where: { deletedAt: null },
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
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // 可创建项目的合同：签署完成 + 尚未建项目
    prisma.contract.findMany({
      where: { status: "COMPLETED" },
      select: {
        id: true,
        contractNo: true,
        customer: { select: { brandName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // 单次合作可关联的客户
  const customers = await prisma.customer.findMany({
    select: { id: true, brandName: true },
    orderBy: { brandName: "asc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usedContractIds = new Set((projects as any[]).map((p) => p.contractId).filter(Boolean));
  const availableContracts = completedContracts
    .filter((c) => !usedContractIds.has(c.id))
    .map((c) => ({ id: c.id, contractNo: c.contractNo, brandName: c.customer.brandName }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (projects as any[]).map((p) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    status: p.status,
    stage: p.stage ?? null,
    customerName: p.customer?.brandName ?? "—",
    businessOwner: p.customer?.businessOwner?.name ?? "—",
    backendOwner: p.customer?.backendOwner?.name ?? "—",
    contractNo: p.contract?.contractNo ?? "—",
    createdBy: p.createdBy?.name ?? "—",
    entryCount: p._count?.entries ?? 0,
    createdAt: p.createdAt.toISOString(),
  }));

  return <ProjectsClient projects={rows} availableContracts={availableContracts} customers={customers} />;
}
