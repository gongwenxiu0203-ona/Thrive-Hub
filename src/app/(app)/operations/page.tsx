import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { currentMonthKey } from "@/lib/financeOperations";
import { OperationsClient } from "./OperationsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "经营管理 · Thraive联盟营销系统" };

export default async function FinanceOperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/finance");
  const sp = await searchParams;

  const month = sp.month || currentMonthKey();
  const initialTab = (sp.tab as "revenue" | "count" | "ar" | "pipeline") || "revenue";

  const [snapshots, ars, pipelines, customers, users] = await Promise.all([
    prisma.clientRevenueSnapshot.findMany({
      where: { month },
      include: {
        customer: { select: { id: true, brandName: true } },
        amOwner: { select: { id: true, name: true } },
        bdOwner: { select: { id: true, name: true } },
      },
      orderBy: { monthlyTotalIncome: "desc" },
    }),
    prisma.accountsReceivable.findMany({
      include: {
        customer: { select: { id: true, brandName: true } },
        followOwner: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.salesPipeline.findMany({
      include: { bdOwner: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      select: { id: true, brandName: true },
      orderBy: { brandName: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "USER"] }, status: "APPROVED" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Client Count Summary: derived from the current month's snapshots
  const allMonthSnapshots = snapshots; // already scoped to the selected month above
  const countSummary = {
    newCount: allMonthSnapshots.filter((s) => s.clientStatus === "NEW").length,
    activeCount: allMonthSnapshots.filter((s) => s.clientStatus === "ACTIVE" || s.clientStatus === "NEW").length,
    cumulativeCount: await prisma.customer.count({ where: { deletedAt: null, contracts: { some: { status: { in: ["SIGNING", "COMPLETED"] } } } } }),
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
      snapshots={snapshots.map((s) => ({
        id: s.id,
        customerId: s.customerId,
        customerName: s.customer?.brandName ?? "（已删除客户）",
        month: s.month,
        projectStartDate: s.projectStartDate?.toISOString() ?? null,
        clientStatus: s.clientStatus,
        monthlyFeeCurrency: s.monthlyFeeCurrency,
        monthlyFeeAmount: s.monthlyFeeAmount,
        exchangeRate: s.exchangeRate,
        monthlyFeeRmb: s.monthlyFeeRmb,
        commissionRate: s.commissionRate,
        monthlyGmv: s.monthlyGmv,
        monthlyCommissionIncome: s.monthlyCommissionIncome,
        monthlyTotalIncome: s.monthlyTotalIncome,
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
      isAdmin={session.role === "ADMIN"}
    />
  );
}
