"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, RefreshCw, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Project = { id: string; name: string; customerName: string; ownerName: string };
type Item = {
  projectId: string;
  projectName: string;
  customerName?: string;
  ownerName?: string;
  target: number;
  actual: number;
  currency?: string;
};
type CurrencyGroup = {
  currency: string;
  monthlyTarget: number;
  weeklySales: number;
  completionRate: number | null;
};
type Payload = {
  enteredProjects?: number;
  totalProjects?: number;
  monthlyTarget?: number | null;
  weeklySales?: number | null;
  completionRate?: number | null;
  currencyGroups?: CurrencyGroup[];
  items?: Item[];
  updatedAt?: string;
};

const weeksForMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const weeks: { value: string; label: string; range: string; endDay: number }[] = [];
  let start = 1;
  let index = 1;

  while (start <= lastDay) {
    const startDate = new Date(year, monthNumber - 1, start);
    const day = startDate.getDay();
    const span = day === 0 ? 1 : 8 - day;
    const end = Math.min(lastDay, start + span - 1);
    weeks.push({
      value: String(index),
      label: `第${index}周`,
      range: `${String(monthNumber).padStart(2, "0")}/${String(start).padStart(2, "0")}-${String(monthNumber).padStart(2, "0")}/${String(end).padStart(2, "0")}`,
      endDay: end,
    });
    start = end + 1;
    index += 1;
  }
  return weeks;
};

export default function SalesProgressDashboard({ projects }: { projects: Project[] }) {
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const initialWeeks = weeksForMonth(initialMonth);
  const initialWeek = initialWeeks.find((option) => {
    const [start, end] = option.range.split("-").map((value) => Number(value.slice(3)));
    return now.getDate() >= start && now.getDate() <= end;
  })?.value ?? initialWeeks.at(-1)?.value ?? "1";

  const [month, setMonth] = useState(initialMonth);
  const [week, setWeek] = useState(initialWeek);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Payload>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const weekOptions = weeksForMonth(month);
  const selectedWeek = weekOptions.find((option) => option.value === week) ?? weekOptions[0];

  const load = async () => {
    setLoading(true);
    setNotice("");
    try {
      const query = new URLSearchParams({ month, week });
      if (projectId) query.set("projectId", projectId);
      const response = await fetch(`/api/project-data/dashboard?${query}`);
      if (!response.ok) throw new Error("聚合数据暂未生成");
      const body = await response.json();
      setData(body.data ?? body);
    } catch (error) {
      setData({});
      setNotice(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!weekOptions.some((option) => option.value === week)) {
      setWeek(month < initialMonth ? weekOptions.at(-1)?.value ?? "1" : "1");
      return;
    }
    void load();
  }, [month, week, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoped = projectId ? projects.filter((project) => project.id === projectId) : projects;
  const items: Item[] = data.items ?? scoped.map((project) => ({
    projectId: project.id,
    projectName: project.name,
    customerName: project.customerName,
    ownerName: project.ownerName,
    target: 0,
    actual: 0,
  }));
  const entered = data.enteredProjects ?? items.filter((item) => item.actual > 0).length;
  const total = data.totalProjects ?? scoped.length;
  const groups = data.currencyGroups ?? [];
  const isMultiCurrency = groups.length > 1 || data.monthlyTarget === null || data.weeklySales === null;
  const fallbackTarget = items.reduce((sum, item) => sum + item.target, 0);
  const fallbackActual = items.reduce((sum, item) => sum + item.actual, 0);
  const target = isMultiCurrency ? null : (data.monthlyTarget ?? fallbackTarget);
  const actual = isMultiCurrency ? null : (data.weeklySales ?? fallbackActual);
  const completion = isMultiCurrency ? null : (data.completionRate ?? (target ? actual! / target * 100 : 0));
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const timeProgress = selectedWeek ? selectedWeek.endDay / daysInMonth * 100 : 0;
  const number = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  const groupNote = (field: "monthlyTarget" | "weeklySales") => groups
    .map((group) => `${group.currency} ${number(group[field])}`)
    .join(" · ") || "请按币种筛选查看";
  const cards = [
    ["已录入项目", `${entered} / ${total}`, `${selectedWeek?.label ?? "本周"}已有销售数据的项目`],
    ["月度总 KPI", target === null ? "多币种" : number(target), target === null ? groupNote("monthlyTarget") : "当前筛选范围目标"],
    ["本周累计销售", actual === null ? "多币种" : number(actual), actual === null ? groupNote("weeklySales") : `截至${selectedWeek?.label ?? "本周"}累计`],
    ["整体完成率", completion === null ? "多币种" : `${completion.toFixed(1)}%`, completion === null ? groups.map((group) => `${group.currency} ${group.completionRate === null ? "—" : `${group.completionRate.toFixed(1)}%`}`).join(" · ") || "不可跨币种计算" : "累计销售 ÷ 月度总 KPI"],
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700">Project sales dashboard</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">项目销售数据跟踪看板</h2>
            <p className="mt-1 text-sm text-slate-500">{month.replace("-", "年")}月 · {selectedWeek?.label}（{selectedWeek?.range}）</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary min-h-10" href="/projects/kpi-config"><Settings2 className="h-4 w-4" />KPI 配置</Link>
            <Link className="btn-secondary min-h-10" href="/projects/source-data"><Database className="h-4 w-4" />源数据管理</Link>
          </div>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[220px_260px_minmax(220px,1fr)_auto] xl:items-end">
          <label className="text-xs font-semibold text-slate-600">年月
            <input className="input mt-1 block w-full" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">周次
            <select className="input mt-1 block w-full" value={week} onChange={(event) => setWeek(event.target.value)}>
              {weekOptions.map((option) => <option key={option.value} value={option.value}>{option.label}（{option.range}）</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">项目
            <select className="input mt-1 block w-full" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">全部项目</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
            <span className="text-xs text-slate-500">数据切换实时生效</span>
            <button className="btn-secondary min-h-10 justify-center" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />刷新数据
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>筛选条件变化后自动更新，也可手动刷新。</span>
          <span>{data.updatedAt ? `更新于 ${new Date(data.updatedAt).toLocaleString("zh-CN")}` : notice || "等待销售数据录入"}</span>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, note], index) => (
          <div key={label} className="card p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={cn("mt-2 text-2xl font-bold", index === 2 ? "text-emerald-600" : "text-slate-900")}>{value}</p>
            <p className="mt-1 text-xs text-slate-400">{note}</p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">项目 KPI 完成度</h3>
            <p className="mt-1 text-xs text-slate-500">按累计完成率与所选周时间进度判断项目风险</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-medium text-slate-700">进度比 = 完成率 ÷ 时间进度</span>
              {[
                ["bg-emerald-500", "正常 ≥ 1.0"],
                ["bg-amber-500", "预警 0.7–<1.0"],
                ["bg-rose-500", "风险 < 0.7"],
                ["bg-slate-300", "待录入"],
              ].map(([color, label]) => <span key={label} className="flex items-center gap-1.5"><i className={cn("h-2 w-2 rounded-full", color)} />{label}</span>)}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const completionRate = item.target ? item.actual / item.target * 100 : 0;
            const progressRatio = timeProgress > 0 ? completionRate / timeProgress : 0;
            const status = item.actual <= 0 || item.target <= 0 ? "PENDING" : progressRatio >= 1 ? "NORMAL" : progressRatio >= 0.7 ? "WARNING" : "RISK";
            const meta = {
              PENDING: ["待录入", "bg-slate-100 text-slate-600", "bg-slate-300"],
              NORMAL: ["正常", "bg-emerald-50 text-emerald-700", "bg-emerald-500"],
              WARNING: ["预警", "bg-amber-50 text-amber-700", "bg-amber-500"],
              RISK: ["风险", "bg-rose-50 text-rose-700", "bg-rose-500"],
            }[status];

            return (
              <article key={item.projectId} className="card p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <Link href={`/projects/${item.projectId}`} className="font-semibold text-slate-900 hover:text-brand-700">{item.projectName}</Link>
                    <p className="mt-1 text-xs text-slate-500">{item.customerName || "未关联客户"} · {item.ownerName || "未指定负责人"}</p>
                  </div>
                  <span className={cn("h-fit rounded-full px-2 py-1 text-[11px]", meta[1])}>{meta[0]}</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-slate-400">月度目标</p><b className="text-lg">{item.currency || ""} {number(item.target)}</b></div>
                  <div className="text-right"><p className="text-xs text-slate-400">累计销售</p><b className="text-lg text-brand-700">{item.currency || ""} {number(item.actual)}</b></div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", meta[2])} style={{ width: `${Math.min(100, Math.max(0, completionRate))}%` }} /></div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div><span className="block text-slate-400">完成率</span><b className="text-slate-700">{completionRate.toFixed(1)}%</b></div>
                  <div className="text-center"><span className="block text-slate-400">时间进度</span><b className="text-slate-700">{timeProgress.toFixed(1)}%</b></div>
                  <div className="text-right"><span className="block text-slate-400">进度比</span><b className="text-slate-700">{status === "PENDING" ? "—" : progressRatio.toFixed(2)}</b></div>
                </div>
              </article>
            );
          })}
        </div>
        {!items.length && <div className="card py-12 text-center text-sm text-slate-500">当前筛选范围暂无项目。</div>}
      </section>
    </div>
  );
}
