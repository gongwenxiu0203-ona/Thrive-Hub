import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AdminClient } from "./AdminClient";

export const metadata = { title: "管理员面板 · Thraive联盟营销系统" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;

  const [users, contractsWithoutCustomer, contractsWithMissingFields, unlinkedSales, untypedAffiliates, projectsWithoutCustomer, auditLogs, apiLogs, apiFailureCount] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, role: true, status: true, brandName: true, uniqueCode: true, invitedById: true,
        invitedBy: { select: { id: true, name: true, email: true } }, createdAt: true,
      },
    }),
    prisma.contract.count({ where: { deletedAt: null, type: { not: "TRANSACTIONAL" }, customerId: null } }),
    prisma.contract.count({
      where: {
        deletedAt: null,
        type: { not: "TRANSACTIONAL" },
        OR: [{ partyA: null }, { accountingPeriod: null }, { feeAmount: null }, { commissionRate: null }],
      },
    }),
    prisma.salesRecord.count({ where: { deletedAt: null, customerId: null } }),
    prisma.affiliate.count({ where: { deletedAt: null, OR: [{ affiliateType: null }, { affiliateType: "" }] } }),
    prisma.project.count({ where: { deletedAt: null, customerId: null } }),
    prisma.adminAuditLog.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true } } },
    }),
    prisma.apiAccessLog.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true } } },
    }),
    prisma.apiAccessLog.count({ where: { outcome: "ERROR", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
  ]);

  const usersWithExtra = users.map((user) => ({
    ...user,
    status: user.status ?? "APPROVED",
    brandName: user.brandName ?? null,
    uniqueCode: user.uniqueCode ?? null,
    inviter: user.invitedBy ? { id: user.invitedBy.id, name: user.invitedBy.name, email: user.invitedBy.email } : null,
    createdAt: user.createdAt.toISOString(),
  }));

  const qualityIssues = [
    { key: "contract-customer", label: "未关联客户的业务合同", description: "非事务性合同必须关联客户，避免项目和收入数据失联。", count: contractsWithoutCustomer, href: "/contracts", tone: "danger" as const },
    { key: "contract-fields", label: "关键字段未补齐合同", description: "缺少甲方、结算周期、服务费或佣金比例。", count: contractsWithMissingFields, href: "/contracts", tone: "warning" as const },
    { key: "sales-customer", label: "未关联客户的推广明细", description: "推广数据 BI 明细尚未归属到客户。", count: unlinkedSales, href: "/bi?tab=detail", tone: "warning" as const },
    { key: "affiliate-type", label: "待定类型联盟商", description: "联盟资源库中尚未补齐联盟商类型。", count: untypedAffiliates, href: "/affiliates?tab=list", tone: "neutral" as const },
    { key: "project-customer", label: "未关联客户的项目", description: "项目需关联客户，才能同步负责人、合同与经营数据。", count: projectsWithoutCustomer, href: "/projects", tone: "warning" as const },
  ];

  return <AdminClient
    initialUsers={usersWithExtra}
    initialTab={sp.tab === "intake" ? "intake" : "overview"}
    overview={{ totalUsers: users.length, pendingUsers: users.filter((user) => user.status === "PENDING").length, auditCount: auditLogs.length, apiFailureCount }}
    qualityIssues={qualityIssues}
    auditLogs={auditLogs.map((log) => ({ id: log.id, actorName: log.actor?.name ?? null, action: log.action, module: log.module, targetLabel: log.targetLabel, summary: log.summary, status: log.status, createdAt: log.createdAt.toISOString() }))}
    apiLogs={apiLogs.map((log) => ({ id: log.id, actorName: log.actor?.name ?? null, method: log.method, route: log.route, operation: log.operation, statusCode: log.statusCode, durationMs: log.durationMs, outcome: log.outcome, errorSummary: log.errorSummary, createdAt: log.createdAt.toISOString() }))}
  />;
}
