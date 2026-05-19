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
  totalFollowers: Record<string, number>;
  placementFlatfees: Record<string, number>;
  monthlyNew: { month: string; count: number }[];
}
type Pair = { name: string; value: number };

const FILTER_KEYS = [
  "sources","categories","types","tags","brands","statuses",
  "modes","owners","topCreators","sampleShipping","q",
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
    users: { id: string; name: string }[];
  };
}

export default function AffiliateDashboard({ options }: Props) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

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

  function clearAll() {
    const next = new URLSearchParams(sp.toString());
    for (const k of FILTER_KEYS) next.delete(k);
    router.push(`${pathname}?${next.toString()}`);
  }

  const userOpts = (options?.users ?? []).map((u) => ({ value: u.id, label: u.name }));

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
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="联盟商总数" value={data.total} />
          <KpiCard label="来源种类" value={data.bySource.filter(s => s.name !== "未填写").length} />
          <KpiCard label="类型种类" value={data.byType.filter(t => t.name !== "未填写").length} />
          <KpiCard label="本月新增" value={data.monthlyNew[data.monthlyNew.length - 1]?.count ?? 0} />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">
          加载中…
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Row 1 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="开发状态Status 分布"
              exportRows={data.byStatus.map((d) => ({ 状态: d.name, 数量: d.value }))}
            >
              <PieView data={data.byStatus} />
            </PanelCard>
            <PanelCard
              title="联盟商来源 分布"
              exportRows={data.bySource.map((d) => ({ 来源: d.name, 数量: d.value }))}
            >
              <PieView data={data.bySource} />
            </PanelCard>
          </div>

          {/* Brand row */}
          {data.byBrand.filter(d => d.name !== "未填写").length > 0 && (
            <PanelCard
              title="品牌 Brand 分布"
              exportRows={data.byBrand.map((d) => ({ 品牌: d.name, 数量: d.value }))}
            >
              <PieView data={data.byBrand.filter(d => d.name !== "未填写")} />
            </PanelCard>
          )}

          {/* Row 2 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="联盟商类型 Type 分布"
              exportRows={data.byType.map((d) => ({ 类型: d.name, 数量: d.value }))}
            >
              <HBarView data={data.byType} height={280} />
            </PanelCard>
            <PanelCard
              title="一级类目 分布"
              exportRows={data.byCategory.map((d) => ({ 类目: d.name, 数量: d.value }))}
            >
              <PieView data={data.byCategory} />
            </PanelCard>
          </div>

          {/* Row 3 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="合作模式 分布"
              exportRows={data.byMode.map((d) => ({ 合作模式: d.name, 数量: d.value }))}
            >
              <PieView data={data.byMode} />
            </PanelCard>
            <PanelCard
              title="样品寄送 分布"
              exportRows={data.bySampleShipping.map((d) => ({ 样品寄送: d.name, 数量: d.value }))}
            >
              <PieView data={data.bySampleShipping} />
            </PanelCard>
          </div>

          {/* Row 4 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="Top Creator 分布"
              exportRows={data.byTopCreator.map((d) => ({ "Top Creator": d.name, 数量: d.value }))}
            >
              <PieView data={data.byTopCreator} />
            </PanelCard>
            <PanelCard
              title="负责人 分布"
              exportRows={data.byOwner.map((d) => ({ 负责人: d.name, 数量: d.value }))}
            >
              <PieView data={data.byOwner} />
            </PanelCard>
          </div>

          {/* Row 5: followers + flatfees */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title="各平台流量/粉丝总量 (K)"
              exportRows={Object.entries(data.totalFollowers).map(([平台, v]) => ({ 平台, "总量(K)": v }))}
            >
              <HBarView
                data={Object.entries(data.totalFollowers).map(([name, value]) => ({ name, value }))}
                height={220}
              />
            </PanelCard>
            <PanelCard
              title="各平台 Flatfee 报价汇总 ($)"
              exportRows={Object.entries(data.placementFlatfees).map(([平台, v]) => ({ 平台, "Flatfee($)": v }))}
            >
              <HBarView
                data={Object.entries(data.placementFlatfees)
                  .filter(([, v]) => v > 0)
                  .map(([name, value]) => ({ name, value }))}
                height={220}
              />
            </PanelCard>
          </div>

          {/* Row 6: tag distribution */}
          {data.byTag.length > 0 && (
            <PanelCard
              title="联盟商标签 分布"
              exportRows={data.byTag.map((d) => ({ 标签: d.name, 数量: d.value }))}
            >
              <HBarView data={data.byTag.slice(0, 20)} height={Math.max(240, data.byTag.slice(0, 20).length * 26)} />
            </PanelCard>
          )}

          {/* Row 7: monthly trend */}
          <PanelCard
            title="近6个月新增联盟商"
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
          <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={48}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            formatter={(v: number) => [
              `${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`,
              "",
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 min-w-0">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="truncate text-slate-600" title={d.name}>{d.name}</span>
            <span className="ml-auto shrink-0 pl-2 font-medium text-slate-900">{d.value}</span>
          </div>
        ))}
      </div>
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
          tick={{ fontSize: 10 }} width={150}
          tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + "…" : v}
        />
        <Tooltip />
        <Bar dataKey="value" name="数量" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty() {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-slate-400">
      暂无数据
    </div>
  );
}
