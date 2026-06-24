"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronDown, ExternalLink, Target, Layers } from "lucide-react";
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
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(rows.slice(0, 2).map((r) => r.employeeId ?? "__UNASSIGNED__")),
  );

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function navigate(filterKey: string, value: string) {
    const usp = new URLSearchParams(window.location.search);
    usp.set("tab", "kpi");
    if (value) usp.set(filterKey, value);
    else usp.delete(filterKey);
    router.push(`/operations?${usp.toString()}`);
  }

  const totalEmployees = rows.length;
  const totalProjects = rows.reduce((a, r) => a + r.project.count, 0);
  const totalChannels = rows.reduce((a, r) => a + r.channel.count, 0);
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
          <span>项目目标 <strong className="text-slate-700">{totalProjects}</strong></span>
          <span>渠道目标 <strong className="text-slate-700">{totalChannels}</strong></span>
          <span>整月未达标 <strong className={totalNotAchieved > 0 ? "text-rose-600" : "text-slate-700"}>{totalNotAchieved}</strong></span>
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
                <th className="px-2 py-2 text-left w-6"></th>
                <th className="px-2 py-2 text-left">员工</th>
                <th className="px-2 py-2 text-center" colSpan={4}>
                  <div className="flex items-center justify-center gap-1">
                    <Target className="h-3.5 w-3.5" /> 项目目标（作为 AM）
                  </div>
                </th>
                <th className="px-2 py-2 text-center" colSpan={4}>
                  <div className="flex items-center justify-center gap-1">
                    <Layers className="h-3.5 w-3.5" /> 渠道目标（作为负责人）
                  </div>
                </th>
                <th className="px-2 py-2 text-right">月度总评</th>
              </tr>
              <tr className="text-[10px] text-slate-400">
                <th></th>
                <th></th>
                <th className="px-2 py-1 text-right">数</th>
                <th className="px-2 py-1 text-right">目标</th>
                <th className="px-2 py-1 text-right">对账 GMV</th>
                <th className="px-2 py-1 text-right">完成率</th>
                <th className="px-2 py-1 text-right">数</th>
                <th className="px-2 py-1 text-right">目标</th>
                <th className="px-2 py-1 text-right">对账 GMV</th>
                <th className="px-2 py-1 text-right">完成率</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = r.employeeId ?? "__UNASSIGNED__";
                const isOpen = expanded.has(key);
                const sym = CURRENCY_SYMBOLS[r.primaryCurrency as Currency] ?? "$";
                return (
                  <>
                    <tr
                      key={key}
                      className={`border-t border-slate-100 ${r.overallAchieved === false ? "bg-rose-50/30" : ""}`}
                    >
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => toggle(key)} className="text-slate-400 hover:text-slate-700">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-2 py-2 font-medium text-slate-800">
                        {r.employeeName}
                        {r.mixedCurrency && <span className="ml-1 text-[10px] text-amber-600" title="货币不一致">⚠</span>}
                      </td>
                      {/* 项目段 */}
                      <td className="px-2 py-2 text-right">{r.project.count}</td>
                      <td className="px-2 py-2 text-right">{r.project.count > 0 ? `${sym}${r.project.totalTarget.toLocaleString()}` : "—"}</td>
                      <td className="px-2 py-2 text-right">{r.project.count > 0 ? `${sym}${r.project.totalReconciliationGmv.toLocaleString()}` : "—"}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${
                        r.project.completionRatePct == null ? "text-slate-400"
                          : r.project.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {r.project.completionRatePct == null ? "—" : `${r.project.completionRatePct.toFixed(1)}%`}
                      </td>
                      {/* 渠道段 */}
                      <td className="px-2 py-2 text-right">{r.channel.count}</td>
                      <td className="px-2 py-2 text-right">{r.channel.count > 0 ? `${sym}${r.channel.totalTarget.toLocaleString()}` : "—"}</td>
                      <td className="px-2 py-2 text-right">{r.channel.count > 0 ? `${sym}${r.channel.totalReconciliationGmv.toLocaleString()}` : "—"}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${
                        r.channel.completionRatePct == null ? "text-slate-400"
                          : r.channel.completionRatePct >= 80 ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {r.channel.completionRatePct == null ? "—" : `${r.channel.completionRatePct.toFixed(1)}%`}
                      </td>
                      {/* 总评 */}
                      <td className="px-2 py-2 text-right">
                        <OverallBadge row={r} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/40">
                        <td></td>
                        <td colSpan={10} className="px-4 py-3">
                          {r.project.items.length > 0 && (
                            <div className="mb-3">
                              <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600">
                                <Target className="h-3 w-3" /> 项目 KPI 明细
                              </p>
                              <ProjectSubTable items={r.project.items} />
                            </div>
                          )}
                          {r.channel.items.length > 0 && (
                            <div>
                              <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600">
                                <Layers className="h-3 w-3" /> 渠道 KPI 明细
                              </p>
                              <ChannelSubTable items={r.channel.items} />
                            </div>
                          )}
                          {r.project.items.length === 0 && r.channel.items.length === 0 && (
                            <p className="text-xs text-slate-400">无明细</p>
                          )}
                        </td>
                      </tr>
                    )}
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

function OverallBadge({ row: r }: { row: EmployeeKpiRow }) {
  if (r.overallAchieved == null) {
    return <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">未设置</span>;
  }
  if (r.overallAchieved) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        达标
        <span className="text-[9px] opacity-70">{r.overallReason === "PROJECT" ? "(按项目)" : "(按渠道)"}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
      未达标
      <span className="text-[9px] opacity-70">{r.overallReason === "PROJECT" ? "(按项目)" : "(按渠道)"}</span>
    </span>
  );
}

function ProjectSubTable({ items }: { items: ProjectKpiRow[] }) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">项目</th>
            <th className="px-2 py-1 text-left">客户</th>
            <th className="px-2 py-1 text-right">月度目标</th>
            <th className="px-2 py-1 text-right">80% 线</th>
            <th className="px-2 py-1 text-right">BI</th>
            <th className="px-2 py-1 text-right">对账</th>
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
                </td>
                <td className="px-2 py-1 text-slate-600">{p.customerName}</td>
                <td className="px-2 py-1 text-right">{sym}{p.monthlyTarget.toLocaleString()}</td>
                <td className="px-2 py-1 text-right text-slate-500">{sym}{p.thresholdAt80.toLocaleString()}</td>
                <td className="px-2 py-1 text-right">{sym}{p.biGmv.toLocaleString()}</td>
                <td className="px-2 py-1 text-right">{sym}{p.reconciliationGmv.toLocaleString()}</td>
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
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">渠道</th>
            <th className="px-2 py-1 text-left">所属项目</th>
            <th className="px-2 py-1 text-left">客户</th>
            <th className="px-2 py-1 text-right">占比 %</th>
            <th className="px-2 py-1 text-right">渠道目标</th>
            <th className="px-2 py-1 text-right">对账 GMV</th>
            <th className="px-2 py-1 text-right">完成率</th>
            <th className="px-2 py-1 text-center">达标</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const sym = CURRENCY_SYMBOLS[c.currency as Currency] ?? "$";
            return (
              <tr key={c.channelTargetId} className={`border-t border-slate-100 ${c.achieved === false ? "bg-rose-50/40" : ""}`}>
                <td className="px-2 py-1 font-medium">{c.channelName} <span className="text-[10px] text-slate-400">({c.role})</span></td>
                <td className="px-2 py-1">
                  <Link href={`/projects/${c.projectId}`} className="inline-flex items-center gap-0.5 text-brand-700 hover:underline">
                    {c.projectName} <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </td>
                <td className="px-2 py-1 text-slate-600">{c.customerName}</td>
                <td className="px-2 py-1 text-right">{c.sharePercent.toFixed(1)}%</td>
                <td className="px-2 py-1 text-right">{sym}{c.monthlyChannelTarget.toLocaleString()}</td>
                <td className="px-2 py-1 text-right">{sym}{c.channelReconciliationGmv.toLocaleString()}</td>
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
