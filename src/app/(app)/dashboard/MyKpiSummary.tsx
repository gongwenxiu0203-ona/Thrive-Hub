import Link from "next/link";
import { Award, ArrowRight, AlertTriangle } from "lucide-react";
import { getMyKpiSummary } from "@/actions/employeeKpi";
import { CURRENCY_SYMBOLS, type Currency } from "@/lib/projectChannels";
import { currentMonthKey } from "@/lib/projectKpi";

/** Renders nothing if the current session has no KPI data. */
export async function MyKpiSummary() {
  const month = currentMonthKey();
  const summary = await getMyKpiSummary(month);
  if (!summary) return null;

  const sym = summary.projects[0]?.currency
    ? CURRENCY_SYMBOLS[summary.projects[0].currency as Currency] ?? "$"
    : "$";
  const rateColor =
    summary.completionRatePct == null
      ? "text-slate-400"
      : summary.completionRatePct >= 80
        ? "text-emerald-600"
        : "text-rose-600";

  // 未达标的项目高亮
  const notAchievedProjects = summary.projects.filter((p) => p.achieved === false);

  return (
    <section className="card mt-6 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-brand-600" />
            <h2 className="font-semibold text-slate-900">我的 KPI 摘要</h2>
            <span className="text-xs text-slate-400">· {month}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            汇总你作为 AM / 项目负责人 / 客户后端负责人 命中的项目
          </p>
        </div>
        <Link href="/operations?tab=kpi" className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
          查看完整 KPI <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="进行中项目" value={String(summary.activeProjectCount)} />
        <Stat
          label="月度 GMV 目标"
          value={`${sym}${summary.totalMonthlyTarget.toLocaleString()}`}
          hint={summary.mixedCurrency ? "项目混币种，仅供参考" : undefined}
        />
        <Stat label="客户对账 GMV" value={`${sym}${summary.totalReconciliationGmv.toLocaleString()}`} />
        <Stat
          label="完成率"
          value={summary.completionRatePct == null ? "—" : `${summary.completionRatePct.toFixed(1)}%`}
          color={rateColor}
        />
        <Stat
          label="未达标项目"
          value={String(summary.notAchievedCount)}
          color={summary.notAchievedCount > 0 ? "text-rose-600" : "text-slate-700"}
        />
      </div>

      {notAchievedProjects.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5" /> 需要重点跟进的项目
          </div>
          <ul className="space-y-1.5">
            {notAchievedProjects.slice(0, 5).map((p) => (
              <li key={p.targetId}>
                <Link
                  href={`/projects/${p.projectId}?targetMonth=${p.month}`}
                  className="flex items-center justify-between rounded border border-rose-100 bg-rose-50/40 px-3 py-1.5 text-xs hover:bg-rose-50"
                >
                  <span className="font-medium text-slate-700">{p.projectName}</span>
                  <span className="text-slate-500">
                    {p.customerName} · 完成率 <strong className="text-rose-600">{p.completionRatePct == null ? "—" : `${p.completionRatePct.toFixed(1)}%`}</strong>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? "text-slate-800"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-amber-600">{hint}</p>}
    </div>
  );
}
