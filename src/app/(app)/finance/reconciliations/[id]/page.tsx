import { notFound } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ReconciliationDetailClient } from "./ReconciliationDetailClient";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { hasPermissionLevel } from "@/lib/permissionGuard";

export default async function ReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const access = await getReconciliationAccess(session, "READ");
  const canEdit = hasPermissionLevel(access.permission, "EDIT");
  const canManage = hasPermissionLevel(access.permission, "MANAGE");
  const { id } = await params;

  const [rec, users] = await Promise.all([
    prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: {
        customer: {
          select: {
            id: true,
            brandName: true,
            channelUserId: true,
            businessOwnerId: true,
            businessOwner: { select: { id: true, name: true, email: true } },
          },
        },
        contract: {
          select: {
            id: true,
            contractNo: true,
            type: true,
            startDate: true,
            endDate: true,
          },
        },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        reviews: {
          include: { reviewer: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        settlements: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { type: "asc" },
        },
      },
    }),
    canEdit ? prisma.user.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }) : Promise.resolve([]),
  ]);

  if (!rec) notFound();

  return (
    <div className="space-y-6">
      <div>
        <BackButton label="返回财务对账" fallbackHref="/finance" />
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {rec.customer.brandName} 月度对账
        </h1>
        <p className="text-sm text-slate-500">
          {rec.contract.contractNo} ·{" "}
          {new Date(rec.periodStart).toLocaleDateString("zh-CN")} ~{" "}
          {new Date(rec.periodEnd).toLocaleDateString("zh-CN")}
        </p>
      </div>

      <ReconciliationDetailClient
        rec={rec}
        currentUserId={session.userId}
        users={users}
        canEdit={canEdit}
        canManage={canManage}
      />
    </div>
  );
}
