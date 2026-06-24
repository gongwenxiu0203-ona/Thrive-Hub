import Link from "next/link";
import { Award, ArrowRight, AlertTriangle, Target, Layers } from "lucide-react";
import { getMyKpiSummary } from "@/actions/employeeKpi";
import { CURRENCY_SYMBOLS, type Currency } from "@/lib/projectChannels";
import { currentMonthKey } from "@/lib/projectKpi";

/** Renders nothing if the current session has no KPI data. */
export async function MyKpiSummary() {
  const month = currentMonthKey();
  const summary = await getMyKpiSummary(month);
  if (!summary) return null;

  const sym = CURRENCY_SYMBOLS[summary.primaryCurrency as Currency] ?? "$";
  const projectRateColor =
    summary.project.completionRatePct == null ? "text-slate-400"
      : summary.project.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600";
  const channelRateColor =
    summary.channel.completionRatePct == null ? "text-slate-400"
      : summary.channel.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600";

  const notAchievedProjects = summary.project.items.filter((p) => p.achieved === false);
  const notAchievedChannels = summary.channel.items.filter((c) => c.achieved === false);

  return (
    <section className="card mt-6 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-brand-600" />
            <h2 className="font-semibold text-slate-900">我的 KPI 摘要</h2>
            <span className="text-xs text-slate-400">· {month}</span>
            <OverallChip ach={summary.overallAchieved} reason={summary.overallReason} />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            项目 KPI（作为 AM）和渠道 KPI（作为负责人）分别考核；月度总评以项目目标为准。
          </p>
        </div>
        <Link href="/operations?tab=kpi" className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
          查看完整 KPI <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 项目段 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-slate-600">
            <Target className="h-3.5 w-3.5" /> 项目 KPI（AM）
          </p>
          {summary.project.count === 0 ? (
            <p className="text-xs text-slate-400">本月没有作为 AM 的项目目标</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Mini label="进行中项目" value={String(summary.project.count)} />
              <Mini label="目标合计" value={`${sym}${summary.project.totalTarget.toLocaleString()}`} hint={summary.mixedCurrency ? "混币种" : undefined} />
              <Mini label="客户对账" value={`${sym}${summary.project.totalReconciliationGmv.toLocaleString()}`} />
              <Mini label="完成率" value={summary.project.completionRatePct == null ? "—" : `${summary.project.completionRatePct.toFixed(1)}%`} color={projectRateColor} />
            </div>
          )}
        </div>

        {/* 渠道段 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-slate-600">
            <Layers className="h-3.5 w-3.5" /> 渠道 KPI（渠道负责人）
          </p>
          {summary.channel.count === 0 ? (
            <p className="text-xs text-slate-400">本月没有作为负责人的渠道目标</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Mini label="负责渠道" value={String(summary.channel.count)} />
              <Mini label="目标合计" value={`${sym}${summary.channel.totalTarget.toLocaleString()}`} />
              <Mini label="折算对账" value={`${sym}${summary.channel.totalReconciliationGmv.toLocaleString()}`} hint="按占比派生" />
              <Mini label="完成率" value={summary.channel.completionRatePct == null ? "—" : `${summary.channel.completionRatePct.toFixed(1)}%`} color={channelRateColor} />
            </div>
          )}
        </div>
      </div>

      {(notAchievedProjects.length > 0 || notAchievedChannels.length > 0) && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5" /> 需要重点跟进
          </div>
          <ul className="space-y-1.5">
            {notAchievedProjects.slice(0, 3).map((p) => (
              <li key={p.targetId}>
                <Link
                  href={`/projects/${p.projectId}?targetMonth=${p.month}`}
                  className="flex items-center justify-between rounded border border-rose-100 bg-rose-50/40 px-3 py-1.5 text-xs hover:bg-rose-50"
                >
                  <span><Target className="inline h-3 w-3 text-rose-500" /> 项目 / <strong>{p.projectName}</strong></span>
                  <span className="text-slate-500">{p.customerName} · 完成率 <strong className="text-rose-600">{p.completionRatePct == null ? "—" : `${p.completionRatePct.toFixed(1)}%`}</strong></span>
                </Link>
              </li>
            ))}
            {notAchievedChannels.slice(0, 3).map((c) => (
              <li key={c.channelTargetId}>
                <Link
                  href={`/projects/${c.projectId}`}
                  className="flex items-center justify-between rounded border border-rose-100 bg-rose-50/40 px-3 py-1.5 text-xs hover:bg-rose-50"
                >
                  <span><Layers className="inline h-3 w-3 text-rose-500" /> 渠道 / <strong>{c.channelName}</strong> · {c.projectName}</span>
                  <span className="text-slate-500">完成率 <strong className="text-rose-600">{c.completionRatePct == null ? "—" : `${c.completionRatePct.toFixed(1)}%`}</strong></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function OverallChip({ ach, reason }: { ach: boolean | null; reason: "PROJECT" | "CHANNEL" | "NONE" }) {
  if (ach == null) return null;
  const label = ach ? "整月达标" : "整月未达标";
  const reasonLabel = reason === "PROJECT" ? "按项目目标" : reason === "CHANNEL" ? "按渠道目标" : "";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
      ach ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
    }`}>
      {label}
      {reasonLabel && <span className="text-[9px] opacity-70">({reasonLabel})</span>}
    </span>
  );
}

function Mini({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="rounded border border-slate-100 p-2">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${color ?? "text-slate-800"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[9px] text-amber-600">{hint}</p>}
    </div>
  );
}
