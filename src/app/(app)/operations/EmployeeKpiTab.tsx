"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronDown, TrendingDown, TrendingUp, ExternalLink } from "lucide-react";
import { CURRENCY_SYMBOLS, type Currency } from "@/lib/projectChannels";
import type { EmployeeKpiRow, ProjectKpiRow } from "@/actions/employeeKpi";

export interface UserOption { id: string; name: string }
export interface CustomerOption { id: string; brandName: string }

export function EmployeeKpiTab({
  rows,
  month,
  amOwnerId,
  customerId,
  projectId,
  isAdmin,
  users,
  customers,
  projects,
}: {
  rows: EmployeeKpiRow[];
  month: string;
  amOwnerId: string;
  customerId: string;
  projectId: string;
  isAdmin: boolean;
  users: UserOption[];
  customers: CustomerOption[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(rows.slice(0, 2).map((r) => r.amOwnerId ?? "__UNASSIGNED__")));

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function navigate(filterKey: string, value: string) {
    const usp = new URLSearchParams(window.location.search);
    usp.set("tab", "kpi");
    if (value) usp.set(filterKey, value); else usp.delete(filterKey);
    router.push(`/operations?${usp.toString()}`);
  }

  const totalEmployees = rows.length;
  const totalProjects = rows.reduce((a, r) => a + r.activeProjectCount, 0);
  const totalNotAchieved = rows.reduce((a, r) => a + r.notAchievedCount, 0);

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
        {isAdmin && (
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
          <span>员工数 <strong className="text-slate-700">{totalEmployees}</strong></span>
          <span>项目数 <strong className="text-slate-700">{totalProjects}</strong></span>
          <span>未达标 <strong className={totalNotAchieved > 0 ? "text-rose-600" : "text-slate-700"}>{totalNotAchieved}</strong></span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-400">
          本月（{month}）尚未有员工 KPI 数据。请在项目详情页设置月度 GMV 目标。
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left w-6"></th>
                <th className="px-3 py-2 text-left">员工</th>
                <th className="px-3 py-2 text-right">进行中项目</th>
                <th className="px-3 py-2 text-right">月度目标合计</th>
                <th className="px-3 py-2 text-right">BI 实际 GMV</th>
                <th className="px-3 py-2 text-right">客户对账 GMV</th>
                <th className="px-3 py-2 text-right">完成率</th>
                <th className="px-3 py-2 text-right">达标 / 未达标</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = r.amOwnerId ?? "__UNASSIGNED__";
                const isOpen = expanded.has(key);
                const sym = r.projects[0]?.currency ? CURRENCY_SYMBOLS[r.projects[0].currency as Currency] ?? "$" : "$";
                return (
                  <>
                    <tr
                      key={key}
                      className={`border-t border-slate-100 ${r.notAchievedCount > 0 ? "bg-rose-50/30" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => toggle(key)} className="text-slate-400 hover:text-slate-700">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.amOwnerName}</td>
                      <td className="px-3 py-2 text-right">{r.activeProjectCount}</td>
                      <td className="px-3 py-2 text-right">
                        {sym}{r.totalMonthlyTarget.toLocaleString()}
                        {r.mixedCurrency && <span className="ml-1 text-[10px] text-amber-600" title="员工项目货币不一致，合计仅供参考">⚠</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{sym}{r.totalBiGmv.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{sym}{r.totalReconciliationGmv.toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${
                        r.completionRatePct == null ? "text-slate-400"
                          : r.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {r.completionRatePct == null ? "—" : `${r.completionRatePct.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          {r.achievedCount > 0 && (
                            <span className="text-emerald-600 inline-flex items-center gap-0.5">
                              <TrendingUp className="h-3.5 w-3.5" /> {r.achievedCount}
                            </span>
                          )}
                          {r.notAchievedCount > 0 && (
                            <span className="text-rose-600 inline-flex items-center gap-0.5">
                              <TrendingDown className="h-3.5 w-3.5" /> {r.notAchievedCount}
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                    {isOpen && r.projects.map((p) => (
                      <ProjectRow key={p.targetId} project={p} />
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project: p }: { project: ProjectKpiRow }) {
  const [open, setOpen] = useState(false);
  const sym = CURRENCY_SYMBOLS[p.currency as Currency] ?? "$";
  return (
    <>
      <tr className={`border-t border-slate-50 ${p.achieved === false ? "bg-rose-50/40" : "bg-slate-50/40"}`}>
        <td className="px-3 py-2"></td>
        <td colSpan={7} className="px-3 py-2">
          <div className="flex items-center gap-2 pl-6">
            <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-700">
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <Link href={`/projects/${p.projectId}?targetMonth=${p.month}`} className="text-sm font-medium text-brand-700 hover:underline inline-flex items-center gap-1">
              {p.projectName} <ExternalLink className="h-3 w-3" />
            </Link>
            <span className="text-xs text-slate-500">/ {p.customerName}</span>
            <span className="ml-auto flex items-center gap-4 text-xs">
              <span>目标 <strong>{sym}{p.monthlyTarget.toLocaleString()}</strong></span>
              <span>80% 线 {sym}{p.thresholdAt80.toLocaleString()}</span>
              <span>BI {sym}{p.biGmv.toLocaleString()}</span>
              <span>对账 {sym}{p.reconciliationGmv.toLocaleString()}</span>
              <span className={`font-semibold ${
                p.completionRatePct == null ? "text-slate-400"
                  : p.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600"
              }`}>
                {p.completionRatePct == null ? "—" : `${p.completionRatePct.toFixed(1)}%`}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                p.achieved == null ? "bg-slate-100 text-slate-500"
                  : p.achieved ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              }`}>
                {p.achieved == null ? "未设置目标" : p.achieved ? "达标" : "未达标"}
              </span>
            </span>
          </div>
        </td>
      </tr>
      {open && p.channels.length > 0 && (
        <tr className="border-t border-slate-50 bg-white">
          <td className="px-3 py-2"></td>
          <td colSpan={7} className="px-3 py-2">
            <div className="ml-10 overflow-x-auto rounded border border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] text-slate-500">
                  <tr>
                    <th className="px-2 py-1 text-left">渠道</th>
                    <th className="px-2 py-1 text-left">负责人</th>
                    <th className="px-2 py-1 text-left">角色</th>
                    <th className="px-2 py-1 text-right">占比 %</th>
                    <th className="px-2 py-1 text-right">目标 GMV</th>
                  </tr>
                </thead>
                <tbody>
                  {p.channels.map((c) => (
                    <tr key={c.id} className="border-t border-slate-50">
                      <td className="px-2 py-1">{c.channelName}</td>
                      <td className="px-2 py-1">{c.ownerName}</td>
                      <td className="px-2 py-1 text-slate-500">{c.role}</td>
                      <td className="px-2 py-1 text-right">{c.sharePercent.toFixed(1)}%</td>
                      <td className="px-2 py-1 text-right">{sym}{c.channelGmv.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
