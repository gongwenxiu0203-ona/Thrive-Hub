import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { customerScope, projectScope } from "@/lib/dataScope";
import { currentMonthKey, monthRange } from "@/lib/financeOperations";
import { OperationsClient } from "./OperationsClient";
import { getEmployeeKpiByMonth } from "@/actions/employeeKpi";
import { resolveUserPermission } from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import type { PermLevel } from "@/lib/featurePermissions";

export const dynamic = "force-dynamic";
const TAB_FEATURES = {
  revenue: "operations.revenue",
  count: "operations.customer_count",
  ar: "operations.accounts_receivable",
  pipeline: "operations.sales_pipeline",
  kpi: "operations.employee_kpi",
} as const;
type OperationsTab = keyof typeof TAB_FEATURES;
export const metadata = { title: "经营驾驶舱 · Thraive 联盟营销系统" };

export default async function FinanceOperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const permissionEntries = await Promise.all(
    Object.entries({
      ...TAB_FEATURES,
      invoices: "operations.invoices",
    }).map(async ([key, feature]) => [
      key,
      await resolveUserPermission(session.userId, feature),
    ] as const),
  );
  const permissions = Object.fromEntries(permissionEntries) as Record<
    OperationsTab | "invoices",
    PermLevel
  >;
  const readableTabs = (Object.keys(TAB_FEATURES) as OperationsTab[]).filter(
    (tab) => hasPermissionLevel(permissions[tab], "READ"),
  );
  if (readableTabs.length === 0 && !hasPermissionLevel(permissions.invoices, "READ")) {
    redirect("/dashboard");
  }

  const month = sp.month || currentMonthKey();
  const { start: monthStart, end: monthEnd } = monthRange(month);
  const requestedTab = sp.tab as OperationsTab | undefined;
  const initialTab = requestedTab && readableTabs.includes(requestedTab)
    ? requestedTab
    : readableTabs[0];
  if (!initialTab) redirect("/invoices");
  if (requestedTab && requestedTab !== initialTab) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (value !== undefined) params.set(key, value);
    }
    params.set("tab", initialTab);
    redirect(`/operations?${params.toString()}`);
  }
  const kpiAmOwnerId = sp.amOwnerId || "";
  const kpiCustomerId = sp.customerId || "";
  const kpiProjectId = sp.projectId || "";
  // ADMIN 在员工 KPI tab 默认看全部员工（除非显式 ?scope=mine）；其他 tab 仍走 mine 默认
  const isAdmin = session.role === "ADMIN";
  const kpiDefaultsAll = isAdmin && initialTab === "kpi" && sp.scope !== "mine";
  const scopeView: "mine" | "all" = sp.scope === "all" || kpiDefaultsAll ? "all" : "mine";
  const needsSnapshots = initialTab === "revenue" || initialTab === "count";

  const [snapshots, reconciliations, ars, pipelines, customers, users] = await Promise.all([
    needsSnapshots ? prisma.clientRevenueSnapshot.findMany({
      where: { month },
      include: {
        customer: {
          select: {
            id: true,
            brandName: true,
            contracts: {
              where: { deletedAt: null, startDate: { not: null } },
              select: { startDate: true },
              orderBy: { startDate: "asc" },
              take: 1,
            },
          },
        },
        amOwner: { select: { id: true, name: true } },
        bdOwner: { select: { id: true, name: true } },
      },
      orderBy: { monthlyTotalIncome: "desc" },
    }) : Promise.resolve([]),
    initialTab === "revenue" ? prisma.customerReconciliation.findMany({
      where: {
        deletedAt: null,
        status: "CONFIRMED",
        periodStart: { lte: monthEnd },
        periodEnd: { gte: monthStart },
      },
      select: {
        customerId: true,
        finalSalesAmount: true,
        actualSalesAmount: true,
      },
    }) : Promise.resolve([]),
    initialTab === "ar" ? prisma.accountsReceivable.findMany({
      include: {
        customer: { select: { id: true, brandName: true } },
        followOwner: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    }) : Promise.resolve([]),
    initialTab === "pipeline" ? prisma.salesPipeline.findMany({
      include: { bdOwner: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve([]),
    initialTab === "ar" ? prisma.customer.findMany({
      where: { deletedAt: null },
      select: { id: true, brandName: true },
      orderBy: { brandName: "asc" },
    }) : Promise.resolve([]),
    (initialTab === "ar" || initialTab === "pipeline" || initialTab === "kpi") ? prisma.user.findMany({
      where: { role: { in: ["ADMIN", "USER"] }, status: "APPROVED" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }) : Promise.resolve([]),
  ]);

  const reconciledGmvByCustomer = new Map<string, number>();
  for (const rec of reconciliations) {
    reconciledGmvByCustomer.set(
      rec.customerId,
      (reconciledGmvByCustomer.get(rec.customerId) ?? 0) + (rec.finalSalesAmount ?? rec.actualSalesAmount ?? 0),
    );
  }

  // KPI rows + KPI 下拉数据（仅当 tab=kpi 时拉取，节省查询）
  const kpiRows = initialTab === "kpi"
    ? await getEmployeeKpiByMonth(
        {
          month,
          amOwnerId: kpiAmOwnerId || undefined,
          customerId: kpiCustomerId || undefined,
          projectId: kpiProjectId || undefined,
        },
        scopeView,
      )
    : [];
  // 非 ADMIN 的下拉用 scope 过滤；ADMIN 看全部（codex review：防止泄漏全量名单）
  const sessForScope = {
    userId: session.userId,
    role: session.role,
    brandName: session.brandName,
  };
  const kpiProjects = initialTab === "kpi"
    ? await prisma.project.findMany({
        where: {
          type: "INTEGRATED",
          deletedAt: null,
          ...(isAdmin ? {} : projectScope(sessForScope, "mine")),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const kpiCustomers = initialTab === "kpi"
    ? await prisma.customer.findMany({
        where: {
          deletedAt: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(isAdmin ? {} : (customerScope(sessForScope, "mine") as any)),
        },
        select: { id: true, brandName: true },
        orderBy: { brandName: "asc" },
      })
    : [];

  // Client Count Summary: derived from the current month's snapshots
  const allMonthSnapshots = snapshots; // already scoped to the selected month above
  const countSummary = {
    newCount: allMonthSnapshots.filter((s) => s.clientStatus === "NEW").length,
    activeCount: allMonthSnapshots.filter((s) => s.clientStatus === "ACTIVE" || s.clientStatus === "NEW").length,
    cumulativeCount: initialTab === "count"
      ? await prisma.customer.count({ where: { deletedAt: null, contracts: { some: { status: { in: ["SIGNING", "COMPLETED"] } } } } })
      : 0,
    churnedCount: allMonthSnapshots.filter((s) => s.clientStatus === "CHURNED").length,
    pausedCount: allMonthSnapshots.filter((s) => s.clientStatus === "PAUSED").length,
    gradeS: allMonthSnapshots.filter((s) => s.revenueGrade === "S").length,
    gradeA: allMonthSnapshots.filter((s) => s.revenueGrade === "A").length,
    gradeB: allMonthSnapshots.filter((s) => s.revenueGrade === "B").length,
    gradeC: allMonthSnapshots.filter((s) => s.revenueGrade === "C").length,
  };

  return (
    <OperationsClient
      initialTab={initialTab}
      month={month}
      snapshots={(initialTab === "revenue" ? snapshots : []).map((s) => ({
        id: s.id,
        customerId: s.customerId,
        customerName: s.customer?.brandName ?? "（已删除客户）",
        month: s.month,
        projectStartDate: (s.projectStartDate ?? s.customer?.contracts[0]?.startDate ?? null)?.toISOString() ?? null,
        clientStatus: s.clientStatus,
        monthlyFeeCurrency: s.monthlyFeeCurrency,
        monthlyFeeAmount: s.monthlyFeeAmount,
        exchangeRate: s.exchangeRate,
        monthlyFeeRmb: s.monthlyFeeRmb,
        commissionRate: s.commissionRate,
        monthlyGmv: s.monthlyGmv,
        monthlyCommissionIncome: s.monthlyCommissionIncome,
        monthlyTotalIncome: s.monthlyTotalIncome,
        monthlyReconciledGmv: s.customerId ? (reconciledGmvByCustomer.get(s.customerId) ?? 0) : 0,
        cumulativeIncome: s.cumulativeIncome,
        amOwnerName: s.amOwner?.name ?? "—",
        bdOwnerName: s.bdOwner?.name ?? "—",
        revenueGrade: s.revenueGrade,
        signingCompany: s.signingCompany,
        receivingCompany: s.receivingCompany,
      }))}
      ars={ars.map((a) => ({
        id: a.id,
        customerId: a.customerId,
        customerName: a.customer?.brandName ?? "—",
        invoiceNo: a.invoiceNo,
        invoiceDate: a.invoiceDate.toISOString(),
        invoiceAmount: a.invoiceAmount,
        currency: a.currency,
        exchangeRate: a.exchangeRate,
        amountRmb: a.amountRmb,
        receivedAmount: a.receivedAmount,
        dueDate: a.dueDate.toISOString(),
        actualReceivedDate: a.actualReceivedDate?.toISOString() ?? null,
        status: a.status,
        riskLevel: a.riskLevel,
        followOwnerId: a.followOwnerId,
        followOwnerName: a.followOwner?.name ?? "—",
        remark: a.remark,
      }))}
      pipelines={pipelines.map((p) => ({
        id: p.id,
        prospectName: p.prospectName,
        source: p.source,
        countryRegion: p.countryRegion,
        category: p.category,
        estimatedMonthlyFee: p.estimatedMonthlyFee,
        estimatedCommissionRate: p.estimatedCommissionRate,
        estimatedGmv: p.estimatedGmv,
        stage: p.stage,
        probability: p.probability,
        expectedSignDate: p.expectedSignDate?.toISOString() ?? null,
        bdOwnerId: p.bdOwnerId,
        bdOwnerName: p.bdOwner?.name ?? "—",
        nextAction: p.nextAction,
        nextFollowUpAt: p.nextFollowUpAt?.toISOString() ?? null,
        remark: p.remark,
      }))}
      customers={customers}
      users={users}
      countSummary={countSummary}
      isAdmin={isAdmin}
      kpiRows={kpiRows}
      kpiAmOwnerId={kpiAmOwnerId}
      kpiCustomerId={kpiCustomerId}
      kpiProjectId={kpiProjectId}
      kpiProjects={kpiProjects}
      kpiCustomers={kpiCustomers}
      permissions={permissions}
    />
  );
}
