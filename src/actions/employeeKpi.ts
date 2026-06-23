"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff, kpiScope, type ViewScope } from "@/lib/dataScope";
import { computeBiGmv, computeReconciliationGmv, completionRate, isAchieved } from "@/lib/projectKpi";

export interface ProjectKpiRow {
  targetId: string;
  projectId: string;
  projectName: string;
  customerId: string | null;
  customerName: string;
  amOwnerId: string | null;
  amOwnerName: string;
  month: string;
  currency: string;
  monthlyTarget: number;
  thresholdAt80: number;          // 80% 达标线
  biGmv: number;                  // BI 实际 GMV
  reconciliationGmv: number;      // 客户对账 GMV（KPI 完成率以此为准）
  completionRatePct: number | null;
  achieved: boolean | null;       // null = 未设置目标
  channels: ChannelRow[];
}

export interface ChannelRow {
  id: string;
  channelName: string;
  ownerId: string | null;
  ownerName: string;
  role: string;
  currency: string;
  sharePercent: number;
  channelGmv: number;
}

export interface EmployeeKpiRow {
  amOwnerId: string | null;
  amOwnerName: string;
  month: string;
  activeProjectCount: number;          // 进行中项目数（INTEGRATED 且 status=ACTIVE，且当月有目标）
  totalMonthlyTarget: number;          // 月度 GMV 目标合计（按主货币 USD 简化合计；混币时给出注记）
  mixedCurrency: boolean;              // 若员工的项目跨币种，置 true
  totalBiGmv: number;
  totalReconciliationGmv: number;
  completionRatePct: number | null;
  achievedCount: number;
  notAchievedCount: number;
  projects: ProjectKpiRow[];
}

interface Filters {
  month: string;
  amOwnerId?: string;          // 指定单个员工
  projectId?: string;
  customerId?: string;
}

/** Fetch all ProjectGmvTarget rows for a month (filtered by view scope), then
 *  enrich each with BI/对账 GMV, completion rate, channel details. */
export async function getEmployeeKpiByMonth(
  filters: Filters,
  view: ViewScope = "mine",
): Promise<EmployeeKpiRow[]> {
  const session = await requireSession();
  if (!isStaff(session.role)) return [];

  const sessForScope = {
    userId: session.userId,
    role: session.role,
    brandName: session.brandName,
  };
  // 普通员工强制 mine
  const effectiveView: ViewScope = session.role === "ADMIN" ? view : "mine";
  const scope = kpiScope(sessForScope, effectiveView);

  const where: Record<string, unknown> = {
    month: filters.month,
    deletedAt: null,
    ...scope,
    // 仅 INTEGRATED 且 status=ACTIVE 的项目参与 KPI
    // （codex review：之前只过滤了 type/deletedAt，已暂停/完成项目会被误计入）
    project: { type: "INTEGRATED", status: "ACTIVE", deletedAt: null },
  };
  if (filters.amOwnerId) where.amOwnerId = filters.amOwnerId;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.customerId) {
    // 嵌套 customerId 在 project 关系下
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (where.project as any) = { ...(where.project as any), customerId: filters.customerId };
  }

  const targets = await prisma.projectGmvTarget.findMany({
    where,
    include: {
      project: {
        include: {
          customer: { select: { id: true, brandName: true } },
        },
      },
      amOwner: { select: { id: true, name: true } },
      channelTargets: {
        orderBy: { sortOrder: "asc" },
        include: { owner: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ amOwnerId: "asc" }, { projectId: "asc" }],
  });

  // Per-project enrichment with BI / 对账 GMV
  const projectRows: ProjectKpiRow[] = [];
  for (const t of targets) {
    const brandName = t.project?.customer?.brandName ?? "";
    const customerId = t.project?.customer?.id ?? null;
    const [biGmv, reconciliationGmv] = await Promise.all([
      computeBiGmv(brandName, t.month),
      computeReconciliationGmv(customerId, t.month),
    ]);
    const rate = completionRate(t.monthlyTarget, reconciliationGmv);
    const ach = isAchieved(t.monthlyTarget, reconciliationGmv);
    projectRows.push({
      targetId: t.id,
      projectId: t.projectId,
      projectName: t.project?.name ?? "—",
      customerId,
      customerName: brandName || "—",
      amOwnerId: t.amOwnerId,
      amOwnerName: t.amOwner?.name ?? "—",
      month: t.month,
      currency: t.currency,
      monthlyTarget: t.monthlyTarget,
      thresholdAt80: t.monthlyTarget * 0.8,
      biGmv,
      reconciliationGmv,
      completionRatePct: rate == null ? null : rate * 100,
      achieved: ach,
      channels: t.channelTargets.map((c) => ({
        id: c.id,
        channelName: c.channelName,
        ownerId: c.ownerId,
        ownerName: c.owner?.name ?? "—",
        role: c.role,
        currency: c.currency,
        sharePercent: c.sharePercent,
        channelGmv: t.monthlyTarget * (c.sharePercent || 0) / 100,
      })),
    });
  }

  // Aggregate by amOwnerId
  const map = new Map<string, EmployeeKpiRow>();
  for (const p of projectRows) {
    const key = p.amOwnerId ?? "__UNASSIGNED__";
    let row = map.get(key);
    if (!row) {
      row = {
        amOwnerId: p.amOwnerId,
        amOwnerName: p.amOwnerName,
        month: filters.month,
        activeProjectCount: 0,
        totalMonthlyTarget: 0,
        mixedCurrency: false,
        totalBiGmv: 0,
        totalReconciliationGmv: 0,
        completionRatePct: null,
        achievedCount: 0,
        notAchievedCount: 0,
        projects: [],
      };
      map.set(key, row);
    }
    row.projects.push(p);
    row.activeProjectCount += 1;
    row.totalMonthlyTarget += p.monthlyTarget;
    row.totalBiGmv += p.biGmv;
    row.totalReconciliationGmv += p.reconciliationGmv;
    if (p.achieved === true) row.achievedCount += 1;
    if (p.achieved === false) row.notAchievedCount += 1;

    // 货币混合检测：以第一个项目的货币为基准
    if (row.projects.length > 1) {
      const baseCurrency = row.projects[0].currency;
      if (p.currency !== baseCurrency) row.mixedCurrency = true;
    }
  }
  // 计算汇总完成率
  for (const r of map.values()) {
    r.completionRatePct = r.totalMonthlyTarget > 0
      ? (r.totalReconciliationGmv / r.totalMonthlyTarget) * 100
      : null;
  }

  return Array.from(map.values()).sort((a, b) => {
    // 未达标多的员工排前面，便于发现风险
    return b.notAchievedCount - a.notAchievedCount;
  });
}

/** Dashboard "我的 KPI 摘要"：只看当前用户当月，且强制 mine。 */
export async function getMyKpiSummary(month: string): Promise<EmployeeKpiRow | null> {
  const session = await requireSession();
  if (!isStaff(session.role)) return null;
  const rows = await getEmployeeKpiByMonth(
    { month, amOwnerId: session.userId },
    "mine",
  );
  // 取自己那条；若不存在但仍有其他匹配（项目负责人 / 客户负责人路径），合并
  const mine = rows.find((r) => r.amOwnerId === session.userId);
  if (mine) return mine;
  // 兜底：合并所有命中的项目作为该员工的"汇总"
  if (rows.length === 0) return null;
  const merged: EmployeeKpiRow = {
    amOwnerId: session.userId,
    amOwnerName: session.name,
    month,
    activeProjectCount: 0,
    totalMonthlyTarget: 0,
    mixedCurrency: false,
    totalBiGmv: 0,
    totalReconciliationGmv: 0,
    completionRatePct: null,
    achievedCount: 0,
    notAchievedCount: 0,
    projects: [],
  };
  for (const r of rows) {
    merged.activeProjectCount += r.activeProjectCount;
    merged.totalMonthlyTarget += r.totalMonthlyTarget;
    merged.totalBiGmv += r.totalBiGmv;
    merged.totalReconciliationGmv += r.totalReconciliationGmv;
    merged.achievedCount += r.achievedCount;
    merged.notAchievedCount += r.notAchievedCount;
    merged.projects.push(...r.projects);
    if (r.mixedCurrency) merged.mixedCurrency = true;
  }
  merged.completionRatePct =
    merged.totalMonthlyTarget > 0
      ? (merged.totalReconciliationGmv / merged.totalMonthlyTarget) * 100
      : null;
  return merged;
}

