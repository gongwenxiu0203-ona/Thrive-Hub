"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ExternalLink, Target, Layers, User } from "lucide-react";
import { CURRENCY_SYMBOLS, type Currency } from "@/lib/projectChannels";
import type { EmployeeKpiRow, ProjectKpiRow, ChannelKpiRow } from "@/actions/employeeKpi";

export interface UserOption { id: string; name: string }
export interface CustomerOption { id: string; brandName: string }

export function EmployeeKpiTab({
  rows,
  month,
  amOwnerId,
  customerId,
  projectId,
  showEmployeeFilter,
  users,
  customers,
  projects,
}: {
  rows: EmployeeKpiRow[];
  month: string;
  amOwnerId: string;
  customerId: string;
  projectId: string;
  showEmployeeFilter: boolean;
  users: UserOption[];
  customers: CustomerOption[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();

  function navigate(filterKey: string, value: string) {
    const usp = new URLSearchParams(window.location.search);
    usp.set("tab", "kpi");
    if (value) usp.set(filterKey, value);
    else usp.delete(filterKey);
    router.push(`/operations?${usp.toString()}`);
  }

  const totalProjectTargets = rows.reduce((a, r) => a + r.project.count, 0);
  const totalChannelTargets = rows.reduce((a, r) => a + r.channel.count, 0);
  const totalNotAchieved = rows.filter((r) => r.overallAchieved === false).length;

  return (
    <div className="space-y-4">
      {/* 筛选 */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <label className="text-xs text-slate-500">月份</label>
        <input
          type="month"
          defaultValue={month}
          onChange={(e) => navigate("month", e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-sm"
        />
        {showEmployeeFilter && (
          <>
            <label className="text-xs text-slate-500">员工</label>
            <select
              value={amOwnerId}
              onChange={(e) => navigate("amOwnerId", e.target.value)}
              className="rounded border border-slate-200 px-2 py-1 text-sm"
            >
              <option value="">全部员工</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </>
        )}
        <label className="text-xs text-slate-500">客户</label>
        <select
          value={customerId}
          onChange={(e) => navigate("customerId", e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="">全部客户</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.brandName}</option>
          ))}
        </select>
        <label className="text-xs text-slate-500">项目</label>
        <select
          value={projectId}
          onChange={(e) => navigate("projectId", e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="">全部项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-3 text-xs text-slate-500">
          <span>员工数 <strong className="text-slate-700">{rows.length}</strong></span>
          <span>项目目标 <strong className="text-slate-700">{totalProjectTargets}</strong></span>
          <span>渠道目标 <strong className="text-slate-700">{totalChannelTargets}</strong></span>
          <span>整月未达标 <strong className={totalNotAchieved > 0 ? "text-rose-600" : "text-slate-700"}>{totalNotAchieved}</strong></span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-400">
          本月（{month}）尚未有员工 KPI 数据。请在项目详情页设置月度 GMV 目标。
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <EmployeeCard key={r.employeeId ?? "__UNASSIGNED__"} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeCard({ row: r }: { row: EmployeeKpiRow }) {
  const [open, setOpen] = useState(false);
  const sym = CURRENCY_SYMBOLS[r.primaryCurrency as Currency] ?? "$";
  const hasProject = r.project.count > 0;
  const hasChannel = r.channel.count > 0;

  // 卡片描边按总评：未达标=红，达标=绿，未设置=灰
  const borderColor =
    r.overallAchieved == null
      ? "border-slate-200"
      : r.overallAchieved
        ? "border-emerald-200"
        : "border-rose-200";

  return (
    <div className={`card overflow-hidden p-0 ${borderColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <User className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {r.employeeName}
              {r.mixedCurrency && <span className="ml-1 text-[10px] text-amber-600" title="货币不一致">⚠</span>}
            </p>
            <p className="text-[10px] text-slate-400">{r.month}</p>
          </div>
        </div>
        <OverallBadge ach={r.overallAchieved} reason={r.overallReason} />
      </div>

      {/* 双段 */}
      <div className="grid gap-0 sm:grid-cols-2">
        {/* 项目段 */}
        <SectionPanel
          icon={<Target className="h-3.5 w-3.5" />}
          title="项目目标（Strategy AM）"
          accent="text-brand-600"
          hasData={hasProject}
          emptyText="本月无项目目标"
          metrics={[
            { label: "项目数", value: String(r.project.count) },
            { label: "目标合计", value: `${sym}${r.project.totalTarget.toLocaleString()}` },
            {
              label: "实际 GMV",
              value: `${sym}${r.project.totalActualGmv.toLocaleString()}`,
              hint: r.project.reconciliationCompleted ? "已对账" : "BI 动态",
            },
            {
              label: "完成率",
              value: r.project.completionRatePct == null ? "—" : `${r.project.completionRatePct.toFixed(1)}%`,
              hint: r.project.reconciliationCompleted ? "已对账" : "BI 动态",
              color: r.project.completionRatePct == null ? "text-slate-400"
                : r.project.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600",
            },
          ]}
        />

        {/* 渠道段 */}
        <SectionPanel
          icon={<Layers className="h-3.5 w-3.5" />}
          title="渠道目标（作为负责人）"
          accent="text-indigo-600"
          hasData={hasChannel}
          emptyText="本月无渠道目标"
          divider
          metrics={[
            { label: "渠道数", value: String(r.channel.count) },
            { label: "目标合计", value: `${sym}${r.channel.totalTarget.toLocaleString()}` },
            {
              label: "折算实际",
              value: `${sym}${r.channel.totalActualGmv.toLocaleString()}`,
              hint: r.channel.reconciliationCompleted ? "已对账，按占比派生" : "BI 动态，按占比派生",
            },
            {
              label: "完成率",
              value: r.channel.completionRatePct == null ? "—" : `${r.channel.completionRatePct.toFixed(1)}%`,
              hint: r.channel.reconciliationCompleted ? "已对账" : "BI 动态",
              color: r.channel.completionRatePct == null ? "text-slate-400"
                : r.channel.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600",
            },
          ]}
        />
      </div>

      {/* 展开明细 */}
      {(hasProject || hasChannel) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/50 py-2 text-xs text-slate-500 hover:bg-slate-100"
        >
          {open ? <>收起明细 <ChevronUp className="h-3 w-3" /></> : <>查看明细 <ChevronDown className="h-3 w-3" /></>}
        </button>
      )}
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-white p-3">
          {hasProject && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-brand-700">
                <Target className="h-3 w-3" /> 项目 KPI 明细
              </p>
              <ProjectSubTable items={r.project.items} />
            </div>
          )}
          {hasChannel && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
                <Layers className="h-3 w-3" /> 渠道 KPI 明细
              </p>
              <ChannelSubTable items={r.channel.items} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SectionMetric {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}

function SectionPanel({
  icon, title, accent, hasData, emptyText, divider, metrics,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  hasData: boolean;
  emptyText: string;
  divider?: boolean;
  metrics: SectionMetric[];
}) {
  return (
    <div className={`p-3 ${divider ? "sm:border-l border-slate-100" : ""}`}>
      <p className={`mb-2 flex items-center gap-1 text-[11px] font-semibold ${accent}`}>
        {icon} {title}
      </p>
      {!hasData ? (
        <p className="py-3 text-center text-xs text-slate-400">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {metrics.map((m) => (
            <div key={m.label} className="rounded border border-slate-100 bg-white px-2 py-1.5">
              <p className="text-[10px] text-slate-400">{m.label}</p>
              <p className={`mt-0.5 text-sm font-semibold ${m.color ?? "text-slate-800"}`}>{m.value}</p>
              {m.hint && <p className="mt-0.5 text-[9px] text-amber-600">{m.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OverallBadge({ ach, reason }: { ach: boolean | null; reason: "PROJECT" | "CHANNEL" | "NONE" }) {
  if (ach == null) {
    return <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">未设置</span>;
  }
  const color = ach ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
  const reasonLabel = reason === "PROJECT" ? "按项目" : "按渠道";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}>
      {ach ? "✓ 整月达标" : "✗ 整月未达标"}
      <span className="text-[9px] opacity-70">({reasonLabel})</span>
    </span>
  );
}

function ProjectSubTable({ items }: { items: ProjectKpiRow[] }) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">项目 / 客户</th>
            <th className="px-2 py-1 text-right">目标</th>
            <th className="px-2 py-1 text-right">实际GMV</th>
            <th className="px-2 py-1 text-right">完成率</th>
            <th className="px-2 py-1 text-center">达标</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const sym = CURRENCY_SYMBOLS[p.currency as Currency] ?? "$";
            return (
              <tr key={p.targetId} className={`border-t border-slate-100 ${p.achieved === false ? "bg-rose-50/40" : ""}`}>
                <td className="px-2 py-1">
                  <Link href={`/projects/${p.projectId}?targetMonth=${p.month}`} className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline">
                    {p.projectName} <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                  <p className="text-[10px] text-slate-400">{p.customerName}</p>
                </td>
                <td className="px-2 py-1 text-right">{sym}{p.monthlyTarget.toLocaleString()}</td>
                <td className="px-2 py-1 text-right">
                  {sym}{p.actualGmv.toLocaleString()}
                  <p className="text-[9px] text-slate-400">{p.reconciliationCompleted ? "已对账" : "BI 动态"}</p>
                </td>
                <td className={`px-2 py-1 text-right font-semibold ${
                  p.completionRatePct == null ? "text-slate-400"
                    : p.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600"
                }`}>
                  {p.completionRatePct == null ? "—" : `${p.completionRatePct.toFixed(1)}%`}
                </td>
                <td className="px-2 py-1 text-center">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                    p.achieved == null ? "bg-slate-100 text-slate-500"
                      : p.achieved ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}>
                    {p.achieved == null ? "—" : p.achieved ? "达标" : "未达标"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChannelSubTable({ items }: { items: ChannelKpiRow[] }) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">渠道 / 项目</th>
            <th className="px-2 py-1 text-right">占比</th>
            <th className="px-2 py-1 text-right">目标</th>
            <th className="px-2 py-1 text-right">实际GMV</th>
            <th className="px-2 py-1 text-right">完成率</th>
            <th className="px-2 py-1 text-center">达标</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const sym = CURRENCY_SYMBOLS[c.currency as Currency] ?? "$";
            return (
              <tr key={c.channelTargetId} className={`border-t border-slate-100 ${c.achieved === false ? "bg-rose-50/40" : ""}`}>
                <td className="px-2 py-1">
                  <p className="font-medium text-slate-700">{c.channelName} <span className="text-[10px] text-slate-400">({c.role})</span></p>
                  <Link href={`/projects/${c.projectId}`} className="inline-flex items-center gap-0.5 text-[10px] text-brand-700 hover:underline">
                    {c.projectName} <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </td>
                <td className="px-2 py-1 text-right">{c.sharePercent.toFixed(1)}%</td>
                <td className="px-2 py-1 text-right">{sym}{c.monthlyChannelTarget.toLocaleString()}</td>
                <td className="px-2 py-1 text-right">
                  {sym}{c.channelActualGmv.toLocaleString()}
                  <p className="text-[9px] text-slate-400">{c.reconciliationCompleted ? "已对账" : "BI 动态"}</p>
                </td>
                <td className={`px-2 py-1 text-right font-semibold ${
                  c.completionRatePct == null ? "text-slate-400"
                    : c.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600"
                }`}>
                  {c.completionRatePct == null ? "—" : `${c.completionRatePct.toFixed(1)}%`}
                </td>
                <td className="px-2 py-1 text-center">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                    c.achieved == null ? "bg-slate-100 text-slate-500"
                      : c.achieved ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}>
                    {c.achieved == null ? "—" : c.achieved ? "达标" : "未达标"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
