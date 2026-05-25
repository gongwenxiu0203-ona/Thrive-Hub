"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { useState, useEffect, useRef, useMemo } from "react";
import { PanelCard } from "@/components/ui/PanelCard";
import { formatCurrencyWith, formatNumber } from "@/lib/utils";

type SortState = { k: string; d: "asc" | "desc" };
function toggleSort(s: SortState, k: string): SortState {
  return s.k === k ? { k, d: s.d === "desc" ? "asc" : "desc" } : { k, d: "desc" };
}
function SortTh({ label, sk, sort, onSort, right }: {
  label: string; sk: string; sort: SortState; onSort: (k: string) => void; right?: boolean;
}) {
  const active = sort.k === sk;
  return (
    <th
      className={`cursor-pointer select-none hover:text-brand-600${right ? " text-right" : ""}`}
      onClick={() => onSort(sk)}
    >
      <span className={`inline-flex items-center gap-0.5${right ? " flex-row-reverse" : ""}`}>
        {label}
        <span className={`text-[9px] ${active ? "text-brand-500" : "text-slate-300"}`}>
          {active ? (sort.d === "desc" ? "↓" : "↑") : "↕"}
        </span>
      </span>
    </th>
  );
}

const PIE_COLORS = [
  "#3b65f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#0ea5e9",
  "#a855f7",
  "#14b8a6",
];

type Pair = { name: string; value: number };
type DailyPoint = {
  date: string;
  revenue: number;
  unitsSold: number;
};
type SeriesPoint = Record<string, string | number>;

export function SalesDashboard({
  programDist,
  platformDist,
  typeDist,
  commissionRateDist,
  brandBars,
  newAffiliates,
  topCreators,
  topProducts,
  daily,
  weekly,
  monthly,
  publisherTrend,
  brandTrend,
  acosTrend,
  currencyCode = "USD",
}: {
  programDist: Pair[];
  platformDist: Pair[];
  typeDist: Pair[];
  commissionRateDist: Pair[];
  brandBars: Pair[];
  newAffiliates: {
    name: string;
    revenue: number;
    firstDate: string;
  }[];
  topCreators: {
    platform: string;
    program: string;
    name: string;
    type: string;
    revenue: number;
    unitsSold: number;
    commission: number;
    rate: number;
    cpa: number;
  }[];
  topProducts: {
    platform: string;
    program: string;
    label: string;
    brand: string;
    parentAsin: string;
    asin: string;
    revenue: number;
    unitsSold: number;
    commission: number;
    rate: number;
    cpa: number;
  }[];
  daily: DailyPoint[];
  weekly: DailyPoint[];
  monthly: DailyPoint[];
  publisherTrend: SeriesPoint[];
  brandTrend: SeriesPoint[];
  acosTrend: SeriesPoint[];
  currencyCode?: string;
}) {
  const formatCurrency = (n: number | null | undefined) => formatCurrencyWith(n, currencyCode);
  const [trendTab, setTrendTab] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );
  const [shiftTab, setShiftTab] = useState<
    "publisher" | "brand" | "acos"
  >("publisher");
  const [crSort, setCrSort] = useState<SortState>({ k: "revenue", d: "desc" });
  const [prSort, setPrSort] = useState<SortState>({ k: "revenue", d: "desc" });

  const trendData =
    trendTab === "daily" ? daily : trendTab === "weekly" ? weekly : monthly;

  const shiftData =
    shiftTab === "publisher"
      ? publisherTrend
      : shiftTab === "brand"
        ? brandTrend
        : acosTrend;

  const shiftKeys =
    shiftData[0]
      ? Object.keys(shiftData[0]).filter((k) => k !== "month")
      : [];

  const sortedCreators = [...topCreators].sort((a, b) => {
    const k = crSort.k as keyof (typeof topCreators)[0];
    return crSort.d === "desc" ? (b[k] as number) - (a[k] as number) : (a[k] as number) - (b[k] as number);
  });
  const sortedProducts = [...topProducts].sort((a, b) => {
    const k = prSort.k as keyof (typeof topProducts)[0];
    return prSort.d === "desc" ? (b[k] as number) - (a[k] as number) : (a[k] as number) - (b[k] as number);
  });

  return (
    <div className="space-y-4">
      {/* Pie charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PanelCard
          title="Affiliate Program by GMV"
          subtitle="联盟类型销售额占比"
          exportRows={programDist.map((p) => ({
            联盟类型: p.name,
            销售金额: p.value,
          }))}
          exportName="affiliate-program-gmv"
        >
          <PieChartView data={programDist} currencyCode={currencyCode} />
        </PanelCard>

        <PanelCard
          title="佣金比例占比图"
          subtitle="联盟商佣金比例分布"
          exportRows={commissionRateDist.map((p) => ({
            佣金比例: p.name,
            占比: p.value,
          }))}
          exportName="commission-rate-distribution"
        >
          <PieChartView data={commissionRateDist} valueFormat="number" />
        </PanelCard>

        <PanelCard
          title="Platform by GMV"
          subtitle="联盟平台销售额占比"
          exportRows={platformDist.map((p) => ({
            联盟平台: p.name,
            销售金额: p.value,
          }))}
          exportName="platform-gmv"
        >
          <PieChartView data={platformDist} currencyCode={currencyCode} />
        </PanelCard>
      </div>

      {/* Pie chart + Bar + Table row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PanelCard
          title="联盟商类型 Type by GMV"
          subtitle="联盟商类型销售额占比"
          exportRows={typeDist.map((p) => ({
            类型: p.name,
            销售金额: p.value,
          }))}
          exportName="affiliate-type-gmv"
        >
          <PieChartView data={typeDist} currencyCode={currencyCode} />
        </PanelCard>

        <PanelCard
          title="品牌出单情况"
          subtitle="按品牌的销售金额"
          exportRows={brandBars.map((b) => ({
            品牌: b.name,
            销售金额: b.value,
          }))}
          exportName="brand-revenue"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brandBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-25}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="value" fill="#3b65f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>

        <PanelCard
          title="新增联盟商"
          subtitle="近期首次出单的联盟商"
          exportRows={newAffiliates.map((a) => ({
            平台联盟商名称: a.name,
            [`销售金额(${currencyCode})`]: a.revenue,
            首单日期: a.firstDate,
          }))}
          exportName="new-affiliates"
          height="h-[320px] overflow-y-auto"
        >
          <table className="data w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th>联盟商名称</th>
                <th className="text-right">销售金额</th>
                <th className="text-right">首单日期</th>
              </tr>
            </thead>
            <tbody>
              {newAffiliates.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400">
                    暂无数据
                  </td>
                </tr>
              ) : (
                newAffiliates.map((a, i) => (
                  <tr key={i}>
                    <td>{a.name}</td>
                    <td className="text-right">
                      {formatCurrency(a.revenue)}
                    </td>
                    <td className="text-right">{a.firstDate}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </PanelCard>
      </div>

      {/* Creator + Product tables */}
      <PanelCard
        title="All Creator by GMV"
        subtitle="按联盟商汇总的销售明细 (Top 50)"
        exportRows={topCreators.map((c) => ({
          联盟平台: c.platform,
          联盟类型: c.program,
          联盟商名称: c.name,
          联盟商类型: c.type,
          销售金额: c.revenue,
          销售数量: c.unitsSold,
          联盟商佣金: c.commission,
          实际佣金率: c.rate,
          CPA: c.cpa,
        }))}
        exportName="all-creator-by-gmv"
        height="h-[360px] overflow-auto"
      >
        <table className="data w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr>
              <th>联盟平台</th>
              <th>联盟类型</th>
              <th>平台联盟商名称</th>
              <th>联盟商类型</th>
              <SortTh label="销售金额" sk="revenue" sort={crSort} onSort={(k) => setCrSort(toggleSort(crSort, k))} right />
              <SortTh label="销售数量" sk="unitsSold" sort={crSort} onSort={(k) => setCrSort(toggleSort(crSort, k))} right />
              <SortTh label="联盟商佣金" sk="commission" sort={crSort} onSort={(k) => setCrSort(toggleSort(crSort, k))} right />
              <SortTh label="实际佣金率" sk="rate" sort={crSort} onSort={(k) => setCrSort(toggleSort(crSort, k))} right />
              <SortTh label="CPA" sk="cpa" sort={crSort} onSort={(k) => setCrSort(toggleSort(crSort, k))} right />
            </tr>
          </thead>
          <tbody>
            {topCreators.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              sortedCreators.map((c, i) => (
                <tr key={i}>
                  <td>{c.platform}</td>
                  <td>{c.program}</td>
                  <td>{c.name}</td>
                  <td>{c.type || "—"}</td>
                  <td className="text-right">{formatCurrency(c.revenue)}</td>
                  <td className="text-right">{formatNumber(c.unitsSold)}</td>
                  <td className="text-right">
                    {formatCurrency(c.commission)}
                  </td>
                  <td className="text-right">
                    {(c.rate * 100).toFixed(2)}%
                  </td>
                  <td className="text-right">{c.cpa.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </PanelCard>

      <PanelCard
        title="Products by GMV and Commission"
        subtitle="按产品 ASIN 汇总 (Top 50)"
        exportRows={topProducts.map((p) => ({
          联盟平台: p.platform,
          联盟类型: p.program,
          链接标签: p.label,
          品牌: p.brand,
          "Parent Asin": p.parentAsin,
          ASIN: p.asin,
          销售金额: p.revenue,
          销售数量: p.unitsSold,
          联盟商佣金: p.commission,
          实际佣金率: p.rate,
          CPA: p.cpa,
        }))}
        exportName="products-by-gmv"
        height="h-[360px] overflow-auto"
      >
        <table className="data w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr>
              <th>联盟平台</th>
              <th>联盟类型</th>
              <th>链接标签</th>
              <th>品牌</th>
              <th>Parent Asin</th>
              <th>ASIN</th>
              <SortTh label="销售金额" sk="revenue" sort={prSort} onSort={(k) => setPrSort(toggleSort(prSort, k))} right />
              <SortTh label="销售数量" sk="unitsSold" sort={prSort} onSort={(k) => setPrSort(toggleSort(prSort, k))} right />
              <SortTh label="联盟商佣金" sk="commission" sort={prSort} onSort={(k) => setPrSort(toggleSort(prSort, k))} right />
              <SortTh label="实际佣金率" sk="rate" sort={prSort} onSort={(k) => setPrSort(toggleSort(prSort, k))} right />
              <SortTh label="CPA" sk="cpa" sort={prSort} onSort={(k) => setPrSort(toggleSort(prSort, k))} right />
            </tr>
          </thead>
          <tbody>
            {topProducts.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-6 text-center text-slate-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              sortedProducts.map((p, i) => (
                <tr key={i}>
                  <td>{p.platform}</td>
                  <td>{p.program}</td>
                  <td>{p.label || "—"}</td>
                  <td>{p.brand}</td>
                  <td>{p.parentAsin || "—"}</td>
                  <td>{p.asin || "—"}</td>
                  <td className="text-right">{formatCurrency(p.revenue)}</td>
                  <td className="text-right">{formatNumber(p.unitsSold)}</td>
                  <td className="text-right">
                    {formatCurrency(p.commission)}
                  </td>
                  <td className="text-right">
                    {(p.rate * 100).toFixed(2)}%
                  </td>
                  <td className="text-right">{p.cpa.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </PanelCard>

      {/* Daily / Weekly / Monthly line chart */}
      <PanelCard
        title={
          trendTab === "daily"
            ? "Daily Sales & Orders"
            : trendTab === "weekly"
              ? "Weekly Sales & Orders"
              : "Monthly Sales & Orders"
        }
        subtitle="销售金额与销售数量趋势"
        exportRows={trendData.map((d) => ({
          时间: d.date,
          销售金额: d.revenue,
          销售数量: d.unitsSold,
        }))}
        exportName={`sales-trend-${trendTab}`}
        height="h-[420px]"
      >
        <div className="mb-2 flex gap-1 border-b border-slate-100 pb-2">
          {(["daily", "weekly", "monthly"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrendTab(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                trendTab === t
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {t === "daily"
                ? "Daily"
                : t === "weekly"
                  ? "Weekly"
                  : "Monthly"}{" "}
              Sales & Orders
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              angle={trendTab === "daily" ? -45 : 0}
              textAnchor={trendTab === "daily" ? "end" : "middle"}
              height={trendTab === "daily" ? 70 : 30}
              interval={trendTab === "daily" ? "preserveStartEnd" : 0}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              label={{
                value: "销售金额",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "#64748b" },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              label={{
                value: "销售数量",
                angle: 90,
                position: "insideRight",
                style: { fontSize: 11, fill: "#64748b" },
              }}
            />
            <Tooltip
              formatter={(v: number, name) =>
                name === "销售金额 Revenue"
                  ? formatCurrency(v)
                  : formatNumber(v)
              }
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="revenue"
              name="销售金额 Revenue"
              stroke="#3b65f6"
              strokeWidth={2}
              dot={{ r: 2 }}
              yAxisId="left"
            />
            <Line
              type="monotone"
              dataKey="unitsSold"
              name="销售数量 Unit Sold"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 2 }}
              yAxisId="right"
            />
          </LineChart>
        </ResponsiveContainer>
      </PanelCard>

      {/* Publisher / Brand / ACOS trend */}
      <PanelCard
        title={
          shiftTab === "publisher"
            ? "各出版商月份销售变化趋势"
            : shiftTab === "brand"
              ? "各品牌月份销售变化趋势"
              : "ACOS 变化趋势"
        }
        exportRows={shiftData}
        exportName={`shift-${shiftTab}`}
        height="h-[420px]"
      >
        <div className="mb-2 flex gap-1 border-b border-slate-100 pb-2">
          {(["publisher", "brand", "acos"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setShiftTab(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                shiftTab === t
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {t === "publisher"
                ? "各出版商月份销售变化趋势"
                : t === "brand"
                  ? "各品牌月份销售变化趋势"
                  : "ACOS 变化趋势"}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={shiftData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v: number) =>
                shiftTab === "acos"
                  ? `${(v * 100).toFixed(2)}%`
                  : formatCurrency(v)
              }
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {shiftKeys.slice(0, 12).map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={PIE_COLORS[i % PIE_COLORS.length]}
                strokeWidth={1.5}
                dot={{ r: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </PanelCard>
    </div>
  );
}

const PIE_RADIAN = Math.PI / 180;

type PieLabelInfo = {
  name: string;
  percent: number;
  /** Initial angle-based position (before spreading) */
  x: number;
  yInit: number;
  /** Adjusted y after overlap-avoidance spreading */
  y: number;
  midAngle: number;
  side: "left" | "right";
  outerRadius: number;
  cx: number;
  cy: number;
  color: string;
};

/**
 * Pre-computes all pie label positions from data + container dimensions,
 * then runs an overlap-avoidance "spreading" algorithm:
 *   1. Separate labels into left-side and right-side groups.
 *   2. Sort each group by their initial y position.
 *   3. Forward pass: push any label that would overlap the previous one downward.
 *   4. Backward pass: push any label that would overlap the next one upward.
 *   5. Clamp to container bounds.
 *
 * This runs outside React so it stays pure and re-computes only when data or
 * container size changes (via useMemo).
 */
function computePieLabels(
  data: Pair[],
  width: number,
  height: number,
): PieLabelInfo[] {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0 || width === 0 || height === 0) return [];

  // Match Recharts' percentage-based radius computation:
  //   maxRadius = min(containerWidth, containerHeight) / 2
  //   outerRadius = percent * maxRadius
  const maxR = Math.min(width, height) / 2;
  const outerRadius = 0.48 * maxR;
  const cx = width / 2;
  // cy="50%" centers the pie; 40% leaves room for label overflow top/bottom
  const cy = height * 0.50;
  // Labels placed at 130% of the outer radius
  const labelR = outerRadius * 1.35;

  // Recharts default: startAngle=0 (3 o'clock), goes counterclockwise in
  // screen coords. midAngle is in the same convention.
  let cumAngle = 0;
  const raw: PieLabelInfo[] = data.map((d, i) => {
    const sweep = (d.value / total) * 360;
    const midAngle = cumAngle + sweep / 2;
    cumAngle += sweep;

    const x = cx + labelR * Math.cos(-midAngle * PIE_RADIAN);
    const y = cy + labelR * Math.sin(-midAngle * PIE_RADIAN);
    return {
      name: d.name,
      percent: d.value / total,
      x,
      yInit: y,
      y,
      midAngle,
      side: x >= cx ? "right" : "left",
      outerRadius,
      cx,
      cy,
      color: PIE_COLORS[i % PIE_COLORS.length],
    };
  });

  const MIN_GAP = 14; // px — minimum vertical spacing between adjacent labels
  const PAD = 6;      // px — keep labels inside container bounds

  function spread(arr: PieLabelInfo[]): PieLabelInfo[] {
    const a = arr.map(l => ({ ...l })).sort((a, b) => a.y - b.y);
    // Forward pass: push overlapping labels downward
    for (let i = 1; i < a.length; i++) {
      if (a[i].y - a[i - 1].y < MIN_GAP) a[i].y = a[i - 1].y + MIN_GAP;
    }
    // Backward pass: pull labels upward if they were pushed too far down
    for (let i = a.length - 2; i >= 0; i--) {
      if (a[i + 1].y - a[i].y < MIN_GAP) a[i].y = a[i + 1].y - MIN_GAP;
    }
    // Clamp to container
    a.forEach(l => {
      l.y = Math.max(PAD, Math.min(height - PAD, l.y));
    });
    return a;
  }

  const right = spread(raw.filter(l => l.side === "right"));
  const left  = spread(raw.filter(l => l.side === "left"));
  return [...right, ...left];
}

/**
 * Pie chart with fully non-overlapping labels.
 *
 * Renders the Recharts Pie without built-in labels, then draws an SVG
 * overlay with labels connected by polylines. Label positions are computed
 * by `computePieLabels` which uses a spreading algorithm to guarantee every
 * label is visible and non-overlapping at any container size.
 *
 * The `outerRadius` is percentage-based so the pie scales proportionally
 * when the PanelCard is zoomed to full-screen.
 */
function PieChartView({
  data,
  valueFormat = "currency",
  currencyCode = "USD",
}: {
  data: Pair[];
  valueFormat?: "currency" | "number";
  currencyCode?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setDims({ width: r.width, height: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const labels = useMemo(
    () => computePieLabels(data, dims.width, dims.height),
    [data, dims],
  );

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="48%"
            label={false}
            labelLine={false}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) =>
              valueFormat === "currency"
                ? formatCurrencyWith(v, currencyCode)
                : formatNumber(v)
            }
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* SVG overlay: labels with polyline connectors, overlap-free */}
      {dims.width > 0 && (
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: dims.width,
            height: dims.height,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {labels.map((l, i) => {
            // Pie-edge point (start of connector)
            const px = l.cx + l.outerRadius * Math.cos(-l.midAngle * PIE_RADIAN);
            const py = l.cy + l.outerRadius * Math.sin(-l.midAngle * PIE_RADIAN);
            // Elbow point (just outside pie edge, keeping direction)
            const er = l.outerRadius + 10;
            const ex = l.cx + er * Math.cos(-l.midAngle * PIE_RADIAN);
            const ey = l.cy + er * Math.sin(-l.midAngle * PIE_RADIAN);
            const isRight = l.side === "right";
            const textX = l.x + (isRight ? 4 : -4);

            return (
              <g key={i}>
                <polyline
                  points={`${px.toFixed(1)},${py.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} ${l.x.toFixed(1)},${l.y.toFixed(1)}`}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={0.8}
                />
                <text
                  x={textX}
                  y={l.y}
                  textAnchor={isRight ? "start" : "end"}
                  dominantBaseline="central"
                  fontSize={10}
                  fill="#374151"
                >
                  {`${l.name}: ${(l.percent * 100).toFixed(1)}%`}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
