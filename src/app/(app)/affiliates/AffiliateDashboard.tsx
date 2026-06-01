"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { X } from "lucide-react";
import { PanelCard } from "@/components/ui/PanelCard";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import {
  AFFILIATE_SOURCE_OPTIONS, AFFILIATE_CATEGORY_OPTIONS, AFFILIATE_TYPE_OPTIONS,
  AFFILIATE_TAG_OPTIONS, AFFILIATE_DEV_STATUS_OPTIONS, COOPERATION_MODE_OPTIONS,
  SAMPLE_SHIPPING_OPTIONS, TOP_CREATOR_OPTIONS,
} from "@/lib/constants";

const COLORS = [
  "#6366f1","#22c55e","#f59e0b","#ef4444","#3b82f6",
  "#ec4899","#14b8a6","#f97316","#a855f7","#84cc16","#06b6d4","#d946ef",
];

interface StatsData {
  total: number;
  bySource: Pair[];
  byType: Pair[];
  byBrand: Pair[];
  byStatus: Pair[];
  byTag: Pair[];
  byOwner: Pair[];
  byRegion: Pair[];
  monthlyNew: { month: string; count: number }[];
}
type Pair = { name: string; value: number };

const FILTER_KEYS = [
  "sources","categories","types","tags","brands","statuses",
  "modes","owners","topCreators","sampleShipping","regions",
  "dateFrom","dateTo","q",
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const toOpts = (xs: readonly string[]) => xs.map((v) => ({ value: v, label: v }));

interface Props {
  options: {
    sources: string[];
    categories: string[];
    types: string[];
    tags: string[];
    brands: string[];
    statuses: string[];
    modes: string[];
    regions: string[];
    users: { id: string; name: string }[];
  };
}

export default function AffiliateDashboard({ options }: Props) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFromVal, setDateFromVal] = useState(sp.get("dateFrom") ?? "");
  const [dateToVal, setDateToVal] = useState(sp.get("dateTo") ?? "");

  const hasAnyFilter = FILTER_KEYS.some((k) => sp.get(k));

  const fetchStats = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = sp.get(k);
      if (v) p.set(k, v);
    }
    fetch(`/api/affiliates/stats?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [sp]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    setDateFromVal(sp.get("dateFrom") ?? "");
    setDateToVal(sp.get("dateTo") ?? "");
  }, [sp]);

  function applyDateFilter() {
    const next = new URLSearchParams(sp.toString());
    if (dateFromVal) next.set("dateFrom", dateFromVal); else next.delete("dateFrom");
    if (dateToVal) next.set("dateTo", dateToVal); else next.delete("dateTo");
    router.push(`${pathname}?${next.toString()}`);
  }

  function clearAll() {
    const next = new URLSearchParams(sp.toString());
    for (const k of FILTER_KEYS) next.delete(k);
    setDateFromVal("");
    setDateToVal("");
    router.push(`${pathname}?${next.toString()}`);
  }

  const userOpts = (options?.users ?? []).map((u) => ({ value: u.id, label: u.name }));
  const nonZero = (arr: Pair[]) => arr.filter((d) => d.name !== "未填写" && d.value > 0);
  const thisMonthCount = data?.monthlyNew[data.monthlyNew.length - 1]?.count ?? 0;

  return (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">筛选器</h2>
          {hasAnyFilter && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600"
            >
              <X className="h-3 w-3" />清空全部
            </button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <FC label="地区 Region">
            <MultiSelectFilter paramKey="regions" placeholder="请选择" options={toOpts(options?.regions ?? [])} width="w-full" />
          </FC>
          <FC label="联盟商来源">
            <MultiSelectFilter paramKey="sources" placeholder="请选择" options={toOpts(AFFILIATE_SOURCE_OPTIONS)} width="w-full" />
          </FC>
          <FC label="一级类目">
            <MultiSelectFilter paramKey="categories" placeholder="请选择" options={toOpts(AFFILIATE_CATEGORY_OPTIONS)} width="w-full" />
          </FC>
          <FC label="联盟商类型 Type">
            <MultiSelectFilter paramKey="types" placeholder="请选择" options={toOpts(AFFILIATE_TYPE_OPTIONS)} width="w-full" />
          </FC>
          <FC label="联盟商标签">
            <MultiSelectFilter paramKey="tags" placeholder="请选择" options={toOpts(AFFILIATE_TAG_OPTIONS)} width="w-full" />
          </FC>
          <FC label="品牌 Brand">
            <MultiSelectFilter paramKey="brands" placeholder="请选择" options={toOpts(options?.brands ?? [])} width="w-full" />
          </FC>
          <FC label="开发状态Status">
            <MultiSelectFilter paramKey="statuses" placeholder="请选择" options={toOpts(AFFILIATE_DEV_STATUS_OPTIONS)} width="w-full" />
          </FC>
          <FC label="合作模式">
            <MultiSelectFilter paramKey="modes" placeholder="请选择" options={toOpts(COOPERATION_MODE_OPTIONS)} width="w-full" />
          </FC>
          <FC label="样品寄送">
            <MultiSelectFilter paramKey="sampleShipping" placeholder="请选择" options={toOpts(SAMPLE_SHIPPING_OPTIONS)} width="w-full" />
          </FC>
          <FC label="Top Creator">
            <MultiSelectFilter paramKey="topCreators" placeholder="请选择" options={toOpts(TOP_CREATOR_OPTIONS)} width="w-full" />
          </FC>
          <FC label="负责人 Person in Charge">
            <MultiSelectFilter paramKey="owners" placeholder="请选择" options={userOpts} width="w-full" />
          </FC>
        </div>
        {/* Date range row */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="shrink-0 text-[11px] text-slate-500">新增起止时间</span>
          <input
            type="date"
            value={dateFromVal}
            onChange={(e) => setDateFromVal(e.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <span className="text-xs text-slate-400">—</span>
          <input
            type="date"
            value={dateToVal}
            onChange={(e) => setDateToVal(e.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            onClick={applyDateFilter}
            className="rounded bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
          >
            确定
          </button>
          {(sp.get("dateFrom") || sp.get("dateTo")) && (
            <button
              onClick={() => {
                setDateFromVal("");
                setDateToVal("");
                const next = new URLSearchParams(sp.toString());
                next.delete("dateFrom");
                next.delete("dateTo");
                router.push(`${pathname}?${next.toString()}`);
              }}
              className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-rose-500"
            >
              <X className="h-3 w-3" />清除日期
            </button>
          )}
        </div>
      </div>

      {/* ── KPI row ────────────────────────────────────────────── */}
      {data && (
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard label="联盟商总数" value={data.total} />
          <KpiCard label="本月新增" value={thisMonthCount} />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">
          加载中…
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Row 1: type pie | tag cloud | source donut */}
          <div className="grid gap-4 lg:grid-cols-3">
            <PanelCard
              title="联盟商类型 Type 分布"
              exportRows={data.byType.map((d) => ({ 类型: d.name, 数量: d.value }))}
            >
              <ChartView data={nonZero(data.byType)} variant="pie" />
            </PanelCard>
            <PanelCard
              title="联盟商标签 词云"
              exportRows={data.byTag.map((d) => ({ 标签: d.name, 数量: d.value }))}
            >
              <TagCloud data={data.byTag.slice(0, 60)} />
            </PanelCard>
            <PanelCard
              title="联盟商来源 分布"
              exportRows={data.bySource.map((d) => ({ 来源: d.name, 数量: d.value }))}
            >
              <ChartView data={nonZero(data.bySource)} variant="donut" />
            </PanelCard>
          </div>

          {/* Row 2: brand donut | owner bar | status donut */}
          <div className="grid gap-4 lg:grid-cols-3">
            <PanelCard
              title="品牌 Brand 分布"
              exportRows={data.byBrand.map((d) => ({ 品牌: d.name, 数量: d.value }))}
            >
              <ChartView data={nonZero(data.byBrand)} variant="donut" />
            </PanelCard>
            <PanelCard
              title="负责人 分布"
              exportRows={data.byOwner.map((d) => ({ 负责人: d.name, 数量: d.value }))}
            >
              <HBarView data={data.byOwner.filter((d) => d.value > 0)} />
            </PanelCard>
            <PanelCard
              title="开发状态 Status 分布"
              exportRows={data.byStatus.map((d) => ({ 状态: d.name, 数量: d.value }))}
            >
              <ChartView data={nonZero(data.byStatus)} variant="donut" />
            </PanelCard>
          </div>

          {/* Row 3: trend (full width) */}
          <PanelCard
            title="联盟商新增数量"
            exportRows={data.monthlyNew.map((d) => ({ 月份: d.month, 新增数量: d.count }))}
          >
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.monthlyNew} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line
                  type="monotone" dataKey="count" name="新增"
                  stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </PanelCard>
        </div>
      )}
    </div>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function FC({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

// ── Chart components ──────────────────────────────────────────────────────────

function ChartView({ data, variant = "pie" }: { data: Pair[]; variant?: "pie" | "donut" }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length || !total) return <Empty />;
  const innerRadius = variant === "donut" ? 48 : 0;
  return (
    <div className="flex h-full flex-col gap-1">
      <ResponsiveContainer width="100%" height={165}>
        <PieChart>
          <Pie
            data={data} dataKey="value" cx="50%" cy="50%"
            outerRadius={72} innerRadius={innerRadius}
          >
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            formatter={(v: number) => [`${v} (${Math.round((v / total) * 100)}%)`, ""]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="min-h-0 flex-1 overflow-y-auto space-y-1 text-xs">
        {data.map((d, i) => (
          <div key={d.name} className="flex min-w-0 items-center gap-1.5">
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="truncate text-slate-600" title={d.name}>{d.name}</span>
            <span className="ml-auto shrink-0 pl-1 font-medium text-slate-900">
              {d.value}
              <span className="ml-1 text-slate-400">({Math.round((d.value / total) * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HBarView({ data }: { data: Pair[] }) {
  if (!data.length) return <Empty />;
  const h = Math.min(Math.max(180, data.length * 28), 270);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis
          dataKey="name" type="category" tick={{ fontSize: 10 }} width={110}
          tickFormatter={(v: string) => v.length > 13 ? v.slice(0, 13) + "…" : v}
        />
        <Tooltip />
        <Bar dataKey="value" name="数量" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TagCloud({ data }: { data: Pair[] }) {
  if (!data.length) return <Empty />;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const max = sorted[0]?.value ?? 1;
  const min = sorted[sorted.length - 1]?.value ?? 0;
  const range = max - min || 1;
  const fontSize = (v: number) => Math.round(11 + ((v - min) / range) * 22);

  return (
    <div className="flex h-full w-full flex-wrap content-center justify-center gap-x-2 gap-y-1.5 overflow-hidden p-2">
      {sorted.map((d, i) => (
        <span
          key={d.name}
          style={{
            fontSize: `${fontSize(d.value)}px`,
            color: COLORS[i % COLORS.length],
            lineHeight: 1.3,
          }}
          className="cursor-default font-semibold"
          title={`${d.name}: ${d.value}`}
        >
          {d.name}
        </span>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-slate-400">
      暂无数据
    </div>
  );
}
