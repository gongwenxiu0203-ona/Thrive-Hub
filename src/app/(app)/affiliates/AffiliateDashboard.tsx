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
  AFFILIATE_SOURCE_OPTIONS,
  AFFILIATE_CATEGORY_OPTIONS,
  AFFILIATE_TYPE_OPTIONS,
  AFFILIATE_TAG_OPTIONS,
  AFFILIATE_DEV_STATUS_OPTIONS,
  COOPERATION_MODE_OPTIONS,
  SAMPLE_SHIPPING_OPTIONS,
  TOP_CREATOR_OPTIONS,
} from "@/lib/constants";

const COLORS = [
  "#6366f1","#22c55e","#f59e0b","#ef4444","#3b82f6",
  "#ec4899","#14b8a6","#f97316","#a855f7","#84cc16","#06b6d4","#d946ef",
];

interface StatsData {
  total: number;
  bySource: Pair[];
  byCategory: Pair[];
  byType: Pair[];
  byBrand: Pair[];
  byStatus: Pair[];
  byTag: Pair[];
  byMode: Pair[];
  byTopCreator: Pair[];
  bySampleShipping: Pair[];
  byOwner: Pair[];
  byRegion: Pair[];
  monthlyNew: { month: string; count: number }[];
}
type Pair = { name: string; value: number };

const FILTER_KEYS = [
  "sources","categories","types","tags","brands","statuses",
  "modes","owners","topCreators","sampleShipping","regions","q",
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
  const [trendMonths, setTrendMonths] = useState(6);

  const hasAnyFilter = FILTER_KEYS.some((k) => sp.get(k));

  const fetchStats = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = sp.get(k);
      if (v) p.set(k, v);
    }
    p.set("months", String(trendMonths));
    fetch(`/api/affiliates/stats?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [sp, trendMonths]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  function clearAll() {
    const next = new URLSearchParams(sp.toString());
    for (const k of FILTER_KEYS) next.delete(k);
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
            <MultiSelectFilter
              paramKey="regions" placeholder="请选择"
              options={toOpts(options?.regions ?? [])} width="w-full"
            />
          </FC>
          <FC label="联盟商来源">
            <MultiSelectFilter
              paramKey="sources" placeholder="请选择"
              options={toOpts(AFFILIATE_SOURCE_OPTIONS)} width="w-full"
            />
          </FC>
          <FC label="一级类目">
            <MultiSelectFilter
              paramKey="categories" placeholder="请选择"
              options={toOpts(AFFILIATE_CATEGORY_OPTIONS)} width="w-full"
            />
          </FC>
          <FC label="联盟商类型 Type">
            <MultiSelectFilter
              paramKey="types" placeholder="请选择"
              options={toOpts(AFFILIATE_TYPE_OPTIONS)} width="w-full"
            />
          </FC>
          <FC label="联盟商标签">
            <MultiSelectFilter
              paramKey="tags" placeholder="请选择"
              options={toOpts(AFFILIATE_TAG_OPTIONS)} width="w-full"
            />
          </FC>
          <FC label="品牌 Brand">
            <MultiSelectFilter
              paramKey="brands" placeholder="请选择"
              options={toOpts(options?.brands ?? [])} width="w-full"
            />
          </FC>
          <FC label="开发状态Status">
            <MultiSelectFilter
              paramKey="statuses" placeholder="请选择"
              options={toOpts(AFFILIATE_DEV_STATUS_OPTIONS)} width="w-full"
            />
          </FC>
          <FC label="合作模式">
            <MultiSelectFilter
              paramKey="modes" placeholder="请选择"
              options={toOpts(COOPERATION_MODE_OPTIONS)} width="w-full"
            />
          </FC>
          <FC label="样品寄送">
            <MultiSelectFilter
              paramKey="sampleShipping" placeholder="请选择"
              options={toOpts(SAMPLE_SHIPPING_OPTIONS)} width="w-full"
            />
          </FC>
          <FC label="Top Creator">
            <MultiSelectFilter
              paramKey="topCreators" placeholder="请选择"
              options={toOpts(TOP_CREATOR_OPTIONS)} width="w-full"
            />
          </FC>
          <FC label="负责人 Person in Charge">
            <MultiSelectFilter
              paramKey="owners" placeholder="请选择"
              options={userOpts} width="w-full"
            />
          </FC>
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
          {/* Row 1: type pie + tag word cloud */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="联盟商类型 Type 分布"
              exportRows={data.byType.map((d) => ({ 类型: d.name, 数量: d.value }))}
            >
              <PieView data={nonZero(data.byType)} />
            </PanelCard>
            <PanelCard
              title="联盟商标签 词云"
              exportRows={data.byTag.map((d) => ({ 标签: d.name, 数量: d.value }))}
            >
              <TagCloud data={data.byTag.slice(0, 50)} />
            </PanelCard>
          </div>

          {/* Row 2: source donut + brand donut */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="联盟商来源 分布"
              exportRows={data.bySource.map((d) => ({ 来源: d.name, 数量: d.value }))}
            >
              <DonutView data={nonZero(data.bySource)} />
            </PanelCard>
            <PanelCard
              title="品牌 Brand 分布"
              exportRows={data.byBrand.map((d) => ({ 品牌: d.name, 数量: d.value }))}
            >
              <DonutView data={nonZero(data.byBrand)} />
            </PanelCard>
          </div>

          {/* Row 3: owner bar + status donut */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="负责人 分布"
              exportRows={data.byOwner.map((d) => ({ 负责人: d.name, 数量: d.value }))}
            >
              <HBarView
                data={data.byOwner.filter((d) => d.value > 0)}
                height={Math.max(200, data.byOwner.length * 32)}
              />
            </PanelCard>
            <PanelCard
              title="开发状态 Status 分布"
              exportRows={data.byStatus.map((d) => ({ 状态: d.name, 数量: d.value }))}
            >
              <DonutView data={nonZero(data.byStatus)} />
            </PanelCard>
          </div>

          {/* Row 4: trend */}
          <PanelCard
            title="联盟商新增数量"
            exportRows={data.monthlyNew.map((d) => ({ 月份: d.month, 新增数量: d.count }))}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">时间范围：</span>
              {[6, 12, 24].map((m) => (
                <button
                  key={m}
                  onClick={() => setTrendMonths(m)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    trendMonths === m
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  近{m}个月
                </button>
              ))}
            </div>
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

// ── Layout helpers ───────────────────────────────────────────────────────────

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

// ── Chart components ─────────────────────────────────────────────────────────

function PieView({ data }: { data: Pair[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0 || total === 0) return <Empty />;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ResponsiveContainer width={200} height={200} minWidth={160}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={0}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            formatter={(v: number) => [`${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`, ""]}
          />
        </PieChart>
      </ResponsiveContainer>
      <Legend data={data} total={total} />
    </div>
  );
}

function DonutView({ data }: { data: Pair[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0 || total === 0) return <Empty />;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ResponsiveContainer width={200} height={200} minWidth={160}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            formatter={(v: number) => [`${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`, ""]}
          />
        </PieChart>
      </ResponsiveContainer>
      <Legend data={data} total={total} />
    </div>
  );
}

function Legend({ data, total }: { data: Pair[]; total: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
      {data.map((d, i) => (
        <div key={d.name} className="flex items-center gap-1.5 min-w-0">
          <div
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: COLORS[i % COLORS.length] }}
          />
          <span className="truncate text-slate-600" title={d.name}>{d.name}</span>
          <span className="ml-auto shrink-0 pl-2 font-medium text-slate-900">
            {d.value}
            <span className="ml-1 text-slate-400">
              ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function HBarView({ data, height = 240 }: { data: Pair[]; height?: number }) {
  if (data.length === 0) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis
          dataKey="name" type="category"
          tick={{ fontSize: 10 }} width={120}
          tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 15) + "…" : v}
        />
        <Tooltip />
        <Bar dataKey="value" name="数量" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TagCloud({ data }: { data: Pair[] }) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;
  const fontSize = (v: number) => Math.round(11 + ((v - min) / range) * 20);

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2 p-2 overflow-auto h-full">
      {data.map((d, i) => (
        <span
          key={d.name}
          style={{ fontSize: `${fontSize(d.value)}px`, color: COLORS[i % COLORS.length] }}
          className="cursor-default font-medium leading-tight"
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
