"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, CartesianGrid, ResponsiveContainer, LabelList,
  Customized,
} from "recharts";
import { X } from "lucide-react";
import { PanelCard } from "@/components/ui/PanelCard";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import {
  AFFILIATE_SOURCE_OPTIONS, AFFILIATE_CATEGORY_OPTIONS, AFFILIATE_TYPE_OPTIONS,
  AFFILIATE_TAG_OPTIONS, AFFILIATE_DEV_STATUS_OPTIONS, COOPERATION_MODE_OPTIONS,
  SAMPLE_SHIPPING_OPTIONS, TOP_CREATOR_OPTIONS, REGION_OPTIONS,
} from "@/lib/constants";

const COLORS = [
  "#6366f1","#22c55e","#f59e0b","#ef4444","#3b82f6",
  "#ec4899","#14b8a6","#f97316","#a855f7","#84cc16","#06b6d4","#d946ef",
];
const RADIAN = Math.PI / 180;

interface StatsData {
  total: number;
  bySource: Pair[];
  byType: Pair[];
  byBrand: Pair[];
  byStatus: Pair[];
  byOwner: Pair[];
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

// ── Anti-collision pie/donut labels rendered via <Customized> ─────────────────
function AntiCollisionLabels({ formattedGraphicalItems, total }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formattedGraphicalItems?: any[];
  total: number;
}) {
  const pieItem = formattedGraphicalItems?.[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sectors: any[] = pieItem?.props?.sectors ?? [];
  if (!sectors.length) return null;

  const { cx, cy, outerRadius } = sectors[0];
  const ELBOW_R  = outerRadius + 16;
  const COL_R    = outerRadius + 66;
  const LINE_H   = 22;

  type Item = {
    index: number; name: string; pct: number; midAngle: number;
    natX: number; natY: number;
  };

  const items: Item[] = sectors.map((s: any, i: number) => {
    const natX = cx + ELBOW_R * Math.cos(-s.midAngle * RADIAN);
    const natY = cy + ELBOW_R * Math.sin(-s.midAngle * RADIAN);
    return {
      index: i,
      name: s.payload?.name ?? s.name ?? "",
      pct: (s.payload?.value ?? s.value) / total,
      midAngle: s.midAngle,
      natX, natY,
    };
  });

  const right = items.filter((i) => i.natX >= cx).sort((a, b) => a.natY - b.natY);
  const left  = items.filter((i) => i.natX  < cx).sort((a, b) => a.natY - b.natY);

  function spread(group: Item[], colX: number, anchor: "start" | "end") {
    if (!group.length) return [];
    const avgY = group.reduce((s, i) => s + i.natY, 0) / group.length;
    const topY = avgY - (group.length * LINE_H) / 2 + LINE_H / 2;
    return group.map((item, i) => ({ ...item, finalX: colX, finalY: topY + i * LINE_H, anchor }));
  }

  const labeled = [
    ...spread(right, cx + COL_R, "start"),
    ...spread(left,  cx - COL_R, "end"),
  ];

  return (
    <>
      {labeled.map((item) => {
        const sR  = outerRadius + 3;
        const sx  = cx + sR * Math.cos(-item.midAngle * RADIAN);
        const sy  = cy + sR * Math.sin(-item.midAngle * RADIAN);
        const ex  = cx + ELBOW_R * Math.cos(-item.midAngle * RADIAN);
        const ey  = cy + ELBOW_R * Math.sin(-item.midAngle * RADIAN);
        const tx  = item.finalX + (item.anchor === "start" ? 4 : -4);
        const col = COLORS[item.index % COLORS.length];

        return (
          <g key={item.index}>
            {/* Kinked leader line: segment → elbow → label column */}
            <path
              d={`M${sx.toFixed(1)},${sy.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)} L${item.finalX.toFixed(1)},${item.finalY.toFixed(1)}`}
              fill="none" stroke={col} strokeWidth={1} opacity={0.6}
            />
            <circle cx={ex} cy={ey} r={1.5} fill={col} />
            {/* Name */}
            <text x={tx} y={item.finalY - 5} fontSize={9} fill="#334155"
              fontWeight={500} textAnchor={item.anchor}>
              {item.name}
            </text>
            {/* Percentage */}
            <text x={tx} y={item.finalY + 7} fontSize={8.5} fill={col}
              fontWeight={700} textAnchor={item.anchor}>
              {Math.round(item.pct * 100)}%
            </text>
          </g>
        );
      })}
    </>
  );
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

  function applyDate() {
    const next = new URLSearchParams(sp.toString());
    if (dateFromVal) next.set("dateFrom", dateFromVal); else next.delete("dateFrom");
    if (dateToVal) next.set("dateTo", dateToVal); else next.delete("dateTo");
    router.push(`${pathname}?${next.toString()}`);
  }

  function clearAll() {
    const next = new URLSearchParams(sp.toString());
    for (const k of FILTER_KEYS) next.delete(k);
    setDateFromVal(""); setDateToVal("");
    router.push(`${pathname}?${next.toString()}`);
  }

  const userOpts = (options?.users ?? []).map((u) => ({ value: u.id, label: u.name }));
  const nonZero = (arr: Pair[]) => arr.filter((d) => d.name !== "未填写" && d.value > 0);
  const thisMonthCount = data?.monthlyNew[data.monthlyNew.length - 1]?.count ?? 0;
  const dateActive = !!(sp.get("dateFrom") || sp.get("dateTo"));

  return (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">筛选器</h2>
          {hasAnyFilter && (
            <button onClick={clearAll} className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600">
              <X className="h-3 w-3" />清空全部
            </button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <FC label="地区 Region">
            <MultiSelectFilter paramKey="regions" placeholder="请选择" options={toOpts(REGION_OPTIONS)} width="w-full" />
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
          {/* Date range — same height as other filter cells */}
          <div className="sm:col-span-2 xl:col-span-2">
            <p className="mb-1 text-[11px] text-slate-500">新增起止时间</p>
            <div className="flex items-center gap-1">
              <input type="date" value={dateFromVal} onChange={(e) => setDateFromVal(e.target.value)}
                className="h-[30px] flex-1 min-w-0 rounded border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <span className="shrink-0 text-xs text-slate-400">—</span>
              <input type="date" value={dateToVal} onChange={(e) => setDateToVal(e.target.value)}
                className="h-[30px] flex-1 min-w-0 rounded border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <button onClick={applyDate}
                className="h-[30px] shrink-0 rounded bg-brand-600 px-2.5 text-xs font-medium text-white hover:bg-brand-700">
                确定
              </button>
              {dateActive && (
                <button onClick={() => {
                  setDateFromVal(""); setDateToVal("");
                  const n = new URLSearchParams(sp.toString());
                  n.delete("dateFrom"); n.delete("dateTo");
                  router.push(`${pathname}?${n.toString()}`);
                }} className="shrink-0 text-slate-400 hover:text-rose-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
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
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">加载中…</div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Row 1: type | source | brand */}
          <div className="grid gap-4 lg:grid-cols-3">
            <PanelCard title="联盟商类型 Type 分布" exportRows={data.byType.map((d) => ({ 类型: d.name, 数量: d.value }))}>
              <PieView data={nonZero(data.byType)} />
            </PanelCard>
            <PanelCard title="联盟商来源 分布" exportRows={data.bySource.map((d) => ({ 来源: d.name, 数量: d.value }))}>
              <DonutView data={nonZero(data.bySource)} />
            </PanelCard>
            <PanelCard title="品牌 Brand 分布" exportRows={data.byBrand.map((d) => ({ 品牌: d.name, 数量: d.value }))}>
              <DonutView data={nonZero(data.byBrand)} />
            </PanelCard>
          </div>

          {/* Row 2: owner vbar | status donut */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard title="负责人 分布" exportRows={data.byOwner.map((d) => ({ 负责人: d.name, 数量: d.value }))}>
              <VBarView data={data.byOwner.filter((d) => d.value > 0)} />
            </PanelCard>
            <PanelCard title="开发状态 Status 分布" exportRows={data.byStatus.map((d) => ({ 状态: d.name, 数量: d.value }))}>
              <DonutView data={nonZero(data.byStatus)} />
            </PanelCard>
          </div>

          {/* Row 3: trend */}
          <PanelCard title="联盟商新增数量" exportRows={data.monthlyNew.map((d) => ({ 月份: d.month, 新增数量: d.count }))}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.monthlyNew} margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" name="新增" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
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
function PieView({ data }: { data: Pair[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length || !total) return <Empty />;
  return (
    <div className="h-full w-full" style={{ overflow: "visible" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 40, right: 120, bottom: 40, left: 120 }}>
          <Pie data={data} dataKey="value" cx="50%" cy="50%"
            outerRadius="52%" innerRadius={0}
            label={false} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => [`${v} (${Math.round((v / total) * 100)}%)`, ""]} />
          <Customized component={(props: any) => <AntiCollisionLabels {...props} total={total} />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutView({ data }: { data: Pair[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length || !total) return <Empty />;
  return (
    <div className="h-full w-full" style={{ overflow: "visible" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 40, right: 120, bottom: 40, left: 120 }}>
          <Pie data={data} dataKey="value" cx="50%" cy="50%"
            outerRadius="52%" innerRadius="30%"
            label={false} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => [`${v} (${Math.round((v / total) * 100)}%)`, ""]} />
          <Customized component={(props: any) => <AntiCollisionLabels {...props} total={total} />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function VBarView({ data }: { data: Pair[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 20, bottom: 52 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0}
          tickFormatter={(v: string) => v.length > 8 ? v.slice(0, 8) + "…" : v} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
        <Tooltip />
        <Bar dataKey="value" name="数量" fill="#6366f1" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: "#475569" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty() {
  return <div className="flex h-32 items-center justify-center text-sm text-slate-400">暂无数据</div>;
}
