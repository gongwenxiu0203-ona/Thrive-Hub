import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectDataPrisma as projectDb } from "@/lib/projectDataPrisma";
import { projectScope } from "@/lib/dataScope";
import { requireFeaturePermission, resolveSafeViewScope } from "@/lib/permissionGuard";
import { requireSession } from "@/lib/session";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const permission = await requireFeaturePermission(session, "projects.progress_dashboard", "READ");
    const url = new URL(request.url);
    const view = await resolveSafeViewScope(session, "projects.progress_dashboard", url.searchParams.get("scope") || "all", permission);
    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    if (!monthPattern.test(month)) throw new Error("月份格式无效");
    const [year, monthNumber] = month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNumber - 1, daysInMonth, 23, 59, 59, 999));
    const weekNumber = Number(url.searchParams.get("week") || 1);
    if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 6) throw new Error("周次格式无效");
    let cursorDay=1,currentWeek=1,weekStartDay=1,weekEndDay=daysInMonth;
    while(cursorDay<=daysInMonth){const cursor=new Date(Date.UTC(year,monthNumber-1,cursorDay));const day=cursor.getUTCDay();const span=day===0?1:8-day;const end=Math.min(daysInMonth,cursorDay+span-1);if(currentWeek===weekNumber){weekStartDay=cursorDay;weekEndDay=end;break;}cursorDay=end+1;currentWeek++;}
    const weekStart = new Date(Date.UTC(year,monthNumber-1,weekStartDay)); const weekEnd = new Date(Date.UTC(year,monthNumber-1,weekEndDay,23,59,59,999));

    const requestedId = url.searchParams.get("projectId");
    const projects = await prisma.project.findMany({
      where: { deletedAt: null, ...(requestedId ? { id: requestedId } : {}), ...projectScope(session, view) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const ids = projects.map((item) => item.id);
    const [targets, monthlySales] = await Promise.all([
      projectDb.projectKpi.findMany({ where: { projectId: { in: ids }, metricKey: "MONTHLY_GMV", periodStart: monthStart, periodEnd: monthEnd } }),
      projectDb.projectMonthlySalesSummary.findMany({ where: { projectId: { in: ids }, dataMonth: month } }),
    ]);

    const items = projects.map((project) => {
      const targetRows = targets.filter((item) => item.projectId === project.id);
      const currency = targetRows[0]?.currency || monthlySales.find((item) => item.projectId === project.id)?.currency || "USD";
      const target = targetRows.filter((item) => (item.currency || "USD") === currency).reduce((sum, item) => sum + (item.targetValue || 0), 0);
      const actual = monthlySales.filter((item) => item.projectId === project.id && item.currency === currency).reduce((sum, item) => sum + item.totalAmount, 0);
      const progress = target > 0 ? actual / target : 0; const timeProgress=weekEndDay/daysInMonth; const progressRatio=timeProgress>0?progress/timeProgress:0;
      return { projectId: project.id, projectName: project.name, target, actual, status: target <= 0 || actual <= 0 ? "PENDING" : progressRatio >= 1 ? "NORMAL" : progressRatio >= 0.7 ? "WARNING" : "RISK", currency };
    });
    const entered = new Set(targets.map((item) => item.projectId));
    const currencyGroups = Object.values(items.reduce<Record<string, { currency: string; monthlyTarget: number; weeklySales: number }>>((groups, item) => {
      const group = groups[item.currency] ||= { currency: item.currency, monthlyTarget: 0, weeklySales: 0 };
      group.monthlyTarget += item.target; group.weeklySales += item.actual; return groups;
    }, {})).map((group) => ({ ...group, completionRate: group.monthlyTarget > 0 ? group.weeklySales / group.monthlyTarget : 0 }));
    const singleCurrency = currencyGroups.length === 1 ? currencyGroups[0] : null;

    return NextResponse.json({ data: {
      enteredProjects: entered.size,
      totalProjects: projects.length,
      monthlyTarget: singleCurrency?.monthlyTarget ?? null,
      weeklySales: singleCurrency?.weeklySales ?? null,
      completionRate: singleCurrency?.completionRate ?? null,
      currency: singleCurrency?.currency ?? null,
      currencyGroups,
      week: { number: weekNumber, start: weekStart.toISOString(), end: weekEnd.toISOString() },
      items,
      updatedAt: new Date().toISOString(),
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "汇总失败" }, { status: 400 });
  }
}
