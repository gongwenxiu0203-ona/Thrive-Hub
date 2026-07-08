"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff, kpiScope, type ViewScope } from "@/lib/dataScope";
import { computeBiGmv, computeReconciliationGmv, completionRate, effectiveKpiActual, isAchieved } from "@/lib/projectKpi";

// 项目目标（作为 amOwner 的项目）
export interface ProjectKpiRow {
  targetId: string;
  projectId: string;
  projectName: string;
  customerId: string | null;
  customerName: string;
  month: string;
  currency: string;
  monthlyTarget: number;
  thresholdAt80: number;          // 80% 达标线
  biGmv: number;                  // BI 实际 GMV
  reconciliationGmv: number;      // 客户对账 GMV
  actualGmv: number;              // KPI 当前采用 GMV：有对账用对账，否则用 BI
  actualSource: "BI" | "RECONCILIATION";
  reconciliationCompleted: boolean;
  completionRatePct: number | null;
  achieved: boolean | null;
}

// 渠道目标（作为 channelOwner 的渠道）
export interface ChannelKpiRow {
  channelTargetId: string;
  projectId: string;
  projectName: string;
  customerName: string;
  channelName: string;
  role: string;
  currency: string;
  sharePercent: number;
  monthlyChannelTarget: number;          // 项目 monthlyTarget × share%
  thresholdAt80: number;
  channelBiGmv: number;                  // 项目 BI GMV × share%
  channelReconciliationGmv: number;      // 项目对账 GMV × share%
  channelActualGmv: number;              // KPI 当前采用 GMV × share%
  actualSource: "BI" | "RECONCILIATION";
  reconciliationCompleted: boolean;
  completionRatePct: number | null;
  achieved: boolean | null;
}

// 员工聚合行（项目 + 渠道 双段）
export interface EmployeeKpiRow {
  employeeId: string | null;
  employeeName: string;
  month: string;
  primaryCurrency: string;
  mixedCurrency: boolean;
  // 项目 KPI（作为 Strategy AM）
  project: {
    count: number;
    totalTarget: number;
    totalBiGmv: number;
    totalReconciliationGmv: number;
    totalActualGmv: number;
    reconciliationCompleted: boolean;
    completionRatePct: number | null;
    achieved: boolean | null;
    items: ProjectKpiRow[];
  };
  // 渠道 KPI（作为渠道负责人）
  channel: {
    count: number;
    totalTarget: number;
    totalBiGmv: number;
    totalReconciliationGmv: number;
    totalActualGmv: number;
    reconciliationCompleted: boolean;
    completionRatePct: number | null;
    achieved: boolean | null;
    items: ChannelKpiRow[];
  };
  // 月度总评：项目目标优先 — 只要项目目标达标即整月达标（按产品规则）
  // - 仅有项目目标：按项目达标
  // - 仅有渠道目标：按渠道达标
  // - 两者皆有：按项目达标（渠道结果作参考）
  // - 都没有目标：null（未设置）
  overallAchieved: boolean | null;
  overallReason: "PROJECT" | "CHANNEL" | "NONE";
}

interface Filters {
  month: string;
  amOwnerId?: string;
  projectId?: string;
  customerId?: string;
}

/** Fetch all ProjectGmvTarget + their ProjectChannelTargets for the month,
 *  then aggregate by employee (union of amOwner and channelOwner).
 *  - INTEGRATED 且 status=ACTIVE 的项目才参与
 *  - 渠道实际 GMV：按 share% 从项目对账 GMV / BI GMV 派生
 *  - 总评按项目优先（产品规则） */
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
  const effectiveView: ViewScope = session.role === "ADMIN" ? view : "mine";
  const targetScope = kpiScope(sessForScope, effectiveView);

  // 普通员工：除了 amOwner 匹配，还要让 channelOwner 匹配能进入 scope
  // 这里改用一个稍宽的 OR：作为 amOwner、作为渠道负责人、或项目 owner/customer.backendOwner 已被 kpiScope 覆盖
  // 为了让普通员工看到自己作为 channelOwner 的项目，扩展 scope
  const scopeForUser =
    effectiveView === "all"
      ? {}
      : {
          OR: [
            { amOwnerId: session.userId },
            { project: { ownerId: session.userId } },
            { project: { customer: { backendOwnerId: session.userId } } },
            // 关键：作为渠道负责人也能命中
            { channelTargets: { some: { ownerId: session.userId } } },
          ],
        };

  const where: Record<string, unknown> = {
    month: filters.month,
    deletedAt: null,
    ...(effectiveView === "all" ? targetScope : scopeForUser),
    project: { type: "INTEGRATED", status: "ACTIVE", deletedAt: null },
  };
  if (filters.amOwnerId) where.amOwnerId = filters.amOwnerId;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.customerId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (where.project as any) = { ...(where.project as any), customerId: filters.customerId };
  }

  const targets = await prisma.projectGmvTarget.findMany({
    where,
    include: {
      project: {
        include: { customer: { select: { id: true, brandName: true } } },
      },
      amOwner: { select: { id: true, name: true } },
      channelTargets: {
        orderBy: { sortOrder: "asc" },
        include: { owner: { select: { id: true, name: true } } },
      },
    },
  });

  // 先把每个 target 的 BI / 对账 GMV 算出来缓存，避免在两个聚合循环中重复查
  const enriched = await Promise.all(
    targets.map(async (t) => {
      const brandName = t.project?.customer?.brandName ?? "";
      const customerId = t.project?.customer?.id ?? null;
      const [biGmv, reconciliationGmv] = await Promise.all([
        computeBiGmv(brandName, t.month),
        computeReconciliationGmv(customerId, t.month),
      ]);
      return { target: t, brandName, customerId, biGmv, reconciliationGmv };
    }),
  );

  // 收集所有相关员工 id：amOwnerId ∪ 每个渠道的 ownerId
  const employeeMeta = new Map<string, { id: string | null; name: string }>();
  for (const e of enriched) {
    if (e.target.amOwnerId) {
      employeeMeta.set(e.target.amOwnerId, {
        id: e.target.amOwnerId,
        name: e.target.amOwner?.name ?? "—",
      });
    }
    for (const ch of e.target.channelTargets) {
      if (ch.ownerId) {
        employeeMeta.set(ch.ownerId, {
          id: ch.ownerId,
          name: ch.owner?.name ?? "—",
        });
      }
    }
  }

  // 为每个员工聚合 project + channel
  const rowsMap = new Map<string, EmployeeKpiRow>();
  for (const [key, meta] of employeeMeta) {
    rowsMap.set(key, {
      employeeId: meta.id,
      employeeName: meta.name,
      month: filters.month,
      primaryCurrency: "USD",
      mixedCurrency: false,
      project: {
        count: 0,
        totalTarget: 0,
        totalBiGmv: 0,
        totalReconciliationGmv: 0,
        totalActualGmv: 0,
        reconciliationCompleted: false,
        completionRatePct: null,
        achieved: null,
        items: [],
      },
      channel: {
        count: 0,
        totalTarget: 0,
        totalBiGmv: 0,
        totalReconciliationGmv: 0,
        totalActualGmv: 0,
        reconciliationCompleted: false,
        completionRatePct: null,
        achieved: null,
        items: [],
      },
      overallAchieved: null,
      overallReason: "NONE",
    });
  }

  for (const e of enriched) {
    const { target: t, brandName, biGmv, reconciliationGmv } = e;
    const projectActual = effectiveKpiActual(biGmv, reconciliationGmv);
    const projectRate = completionRate(t.monthlyTarget, projectActual.actualGmv);
    const projectAch = isAchieved(t.monthlyTarget, projectActual.actualGmv);

    // 项目 KPI 归入 amOwner
    if (t.amOwnerId && rowsMap.has(t.amOwnerId)) {
      const row = rowsMap.get(t.amOwnerId)!;
      row.project.items.push({
        targetId: t.id,
        projectId: t.projectId,
        projectName: t.project?.name ?? "—",
        customerId: e.customerId,
        customerName: brandName || "—",
        month: t.month,
        currency: t.currency,
        monthlyTarget: t.monthlyTarget,
        thresholdAt80: t.monthlyTarget * 0.8,
        biGmv,
        reconciliationGmv,
        actualGmv: projectActual.actualGmv,
        actualSource: projectActual.actualSource,
        reconciliationCompleted: projectActual.reconciliationCompleted,
        completionRatePct: projectRate == null ? null : projectRate * 100,
        achieved: projectAch,
      });
      row.project.count += 1;
      row.project.totalTarget += t.monthlyTarget;
      row.project.totalBiGmv += biGmv;
      row.project.totalReconciliationGmv += reconciliationGmv;
      row.project.totalActualGmv += projectActual.actualGmv;
      row.project.reconciliationCompleted =
        row.project.reconciliationCompleted || projectActual.reconciliationCompleted;

      // 主货币
      if (row.project.count === 1 && row.channel.count === 0) {
        row.primaryCurrency = t.currency;
      } else if (t.currency !== row.primaryCurrency) {
        row.mixedCurrency = true;
      }
    }

    // 渠道 KPI 归入每个 channelOwner
    for (const ch of t.channelTargets) {
      if (!ch.ownerId || !rowsMap.has(ch.ownerId)) continue;
      const row = rowsMap.get(ch.ownerId)!;
      const channelTarget = t.monthlyTarget * (ch.sharePercent || 0) / 100;
      const channelBi = biGmv * (ch.sharePercent || 0) / 100;
      const channelRec = reconciliationGmv * (ch.sharePercent || 0) / 100;
      const channelActual = effectiveKpiActual(channelBi, channelRec);
      const chRate = completionRate(channelTarget, channelActual.actualGmv);
      const chAch = isAchieved(channelTarget, channelActual.actualGmv);
      row.channel.items.push({
        channelTargetId: ch.id,
        projectId: t.projectId,
        projectName: t.project?.name ?? "—",
        customerName: brandName || "—",
        channelName: ch.channelName,
        role: ch.role,
        currency: ch.currency,
        sharePercent: ch.sharePercent,
        monthlyChannelTarget: channelTarget,
        thresholdAt80: channelTarget * 0.8,
        channelBiGmv: channelBi,
        channelReconciliationGmv: channelRec,
        channelActualGmv: channelActual.actualGmv,
        actualSource: channelActual.actualSource,
        reconciliationCompleted: channelActual.reconciliationCompleted,
        completionRatePct: chRate == null ? null : chRate * 100,
        achieved: chAch,
      });
      row.channel.count += 1;
      row.channel.totalTarget += channelTarget;
      row.channel.totalBiGmv += channelBi;
      row.channel.totalReconciliationGmv += channelRec;
      row.channel.totalActualGmv += channelActual.actualGmv;
      row.channel.reconciliationCompleted =
        row.channel.reconciliationCompleted || channelActual.reconciliationCompleted;

      if (row.project.count === 0 && row.channel.count === 1) {
        row.primaryCurrency = ch.currency;
      } else if (ch.currency !== row.primaryCurrency) {
        row.mixedCurrency = true;
      }
    }
  }

  // 完成率 + 总评
  for (const row of rowsMap.values()) {
    if (row.project.totalTarget > 0) {
      row.project.completionRatePct =
        (row.project.totalActualGmv / row.project.totalTarget) * 100;
      row.project.achieved = row.project.completionRatePct >= 80;
    }
    if (row.channel.totalTarget > 0) {
      row.channel.completionRatePct =
        (row.channel.totalActualGmv / row.channel.totalTarget) * 100;
      row.channel.achieved = row.channel.completionRatePct >= 80;
    }
    // 总评：项目优先
    if (row.project.count > 0) {
      row.overallAchieved = row.project.achieved;
      row.overallReason = "PROJECT";
    } else if (row.channel.count > 0) {
      row.overallAchieved = row.channel.achieved;
      row.overallReason = "CHANNEL";
    } else {
      row.overallAchieved = null;
      row.overallReason = "NONE";
    }
  }

  return Array.from(rowsMap.values()).sort((a, b) => {
    // 未达标排前
    const aNotAch = (a.project.achieved === false ? 1 : 0) + (a.channel.achieved === false ? 1 : 0);
    const bNotAch = (b.project.achieved === false ? 1 : 0) + (b.channel.achieved === false ? 1 : 0);
    if (bNotAch !== aNotAch) return bNotAch - aNotAch;
    return (b.project.count + b.channel.count) - (a.project.count + a.channel.count);
  });
}

/** Dashboard "我的 KPI 摘要"：当前用户当月汇总（项目 + 渠道）。 */
export async function getMyKpiSummary(month: string): Promise<EmployeeKpiRow | null> {
  const session = await requireSession();
  if (!isStaff(session.role)) return null;
  // 强制 mine + 限定到自己
  const rows = await getEmployeeKpiByMonth({ month }, "mine");
  const mine = rows.find((r) => r.employeeId === session.userId);
  return mine ?? null;
}
