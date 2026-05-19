"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { ChevronDown, X, ClipboardPaste } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";

export type SaleRec = {
  id: string;
  orderDate: string;
  brand: string;
  store: string | null;
  asin: string | null;
  revenue: number;
  unitsSold: number;
  commission: number;
  commissionRate: number;
  affiliatePlatform: string;
  affiliateProgram: string | null;
  storeProductLabel: string | null;
};

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

function MultiSelectDropdown({
  label, options, selected, onChange,
}: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  function toggle(o: string) {
    onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]);
  }

  function applyPaste() {
    const items = pasteText.split(/[\n,，;；\t]+/).map(s => s.trim()).filter(Boolean);
    const matched = options.filter(o => items.some(p => o.toLowerCase().includes(p.toLowerCase())));
    onChange([...new Set([...selected, ...matched])]);
    setPasteText(""); setPasteMode(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
          selected.length > 0
            ? "border-brand-400 bg-brand-50 text-brand-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-1 border-b border-slate-100 p-2">
            <input
              autoFocus
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-brand-400"
              placeholder="搜索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button
              type="button"
              title="批量粘贴"
              onClick={() => setPasteMode(!pasteMode)}
              className={`rounded-lg p-1.5 transition-colors ${pasteMode ? "bg-brand-100 text-brand-600" : "text-slate-400 hover:bg-slate-100"}`}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
            </button>
          </div>

          {pasteMode ? (
            <div className="space-y-1.5 p-2">
              <p className="text-[10px] text-slate-400">每行一个值，或逗号分隔，自动模糊匹配</p>
              <textarea
                autoFocus
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-400"
                rows={4}
                placeholder="粘贴多个值..."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              <button
                type="button"
                onClick={applyPaste}
                className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                应用 ({pasteText.split(/[\n,，;；\t]+/).filter(s => s.trim()).length} 项)
              </button>
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5">
              {filtered.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-400">无匹配项</p>
              ) : (
                filtered.map(o => (
                  <label key={o} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-brand-600"
                      checked={selected.includes(o)}
                      onChange={() => toggle(o)}
                    />
                    <span className="truncate text-slate-700">{o}</span>
                  </label>
                ))
              )}
            </div>
          )}

          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
              <span className="text-[10px] text-slate-400">已选 {selected.length} 项</span>
              <button type="button" onClick={() => onChange([])} className="text-[10px] text-rose-500 hover:text-rose-600">
                清除全部
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AffiliateSalesPanel({ salesRecords }: { salesRecords: SaleRec[] }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selBrands, setSelBrands] = useState<string[]>([]);
  const [selStores, setSelStores] = useState<string[]>([]);
  const [selLabels, setSelLabels] = useState<string[]>([]);
  const [selPrograms, setSelPrograms] = useState<string[]>([]);
  const [chartTab, setChartTab] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [tableSort, setTableSort] = useState<SortState>({ k: "revenue", d: "desc" });

  const allBrands = useMemo(() => [...new Set(salesRecords.map(r => r.brand).filter(Boolean))].sort(), [salesRecords]);
  const allStores = useMemo(() => [...new Set(salesRecords.map(r => r.store).filter((x): x is string => !!x))].sort(), [salesRecords]);
  const allLabels = useMemo(() => [...new Set(salesRecords.map(r => r.storeProductLabel).filter((x): x is string => !!x))].sort(), [salesRecords]);
  const allPrograms = useMemo(() => [...new Set(salesRecords.map(r => r.affiliateProgram).filter((x): x is string => !!x))].sort(), [salesRecords]);

  const filtered = useMemo(() => salesRecords.filter(r => {
    const date = new Date(r.orderDate);
    if (dateFrom && date < new Date(dateFrom)) return false;
    if (dateTo && date > new Date(dateTo + "T23:59:59")) return false;
    if (selBrands.length && !selBrands.includes(r.brand)) return false;
    if (selStores.length && r.store && !selStores.includes(r.store)) return false;
    if (selLabels.length && r.storeProductLabel && !selLabels.includes(r.storeProductLabel)) return false;
    if (selPrograms.length && r.affiliateProgram && !selPrograms.includes(r.affiliateProgram)) return false;
    return true;
  }), [salesRecords, dateFrom, dateTo, selBrands, selStores, selLabels, selPrograms]);

  const totRevenue = useMemo(() => filtered.reduce((s, r) => s + r.revenue, 0), [filtered]);
  const totUnits = useMemo(() => filtered.reduce((s, r) => s + r.unitsSold, 0), [filtered]);
  const totCommission = useMemo(() => filtered.reduce((s, r) => s + r.commission, 0), [filtered]);
  // Weighted average commissionRate by revenue (commissionRate is already a decimal, e.g. 0.10 = 10%)
  const avgRate = useMemo(() => {
    if (totRevenue === 0) return 0;
    return filtered.reduce((s, r) => s + r.commissionRate * r.revenue, 0) / totRevenue * 100;
  }, [filtered, totRevenue]);

  const dailyData = useMemo(() => {
    const map = new Map<string, { revenue: number; unitsSold: number }>();
    filtered.forEach(r => {
      const d = new Date(r.orderDate).toISOString().slice(0, 10);
      const e = map.get(d) ?? { revenue: 0, unitsSold: 0 };
      e.revenue += r.revenue; e.unitsSold += r.unitsSold;
      map.set(d, e);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));
  }, [filtered]);

  const weeklyData = useMemo(() => {
    const map = new Map<string, { revenue: number; unitsSold: number }>();
    filtered.forEach(r => {
      const d = new Date(r.orderDate);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
      const e = map.get(key) ?? { revenue: 0, unitsSold: 0 };
      e.revenue += r.revenue; e.unitsSold += r.unitsSold;
      map.set(key, e);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));
  }, [filtered]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { revenue: number; unitsSold: number }>();
    filtered.forEach(r => {
      const d = new Date(r.orderDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const e = map.get(key) ?? { revenue: 0, unitsSold: 0 };
      e.revenue += r.revenue; e.unitsSold += r.unitsSold;
      map.set(key, e);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));
  }, [filtered]);

  const chartData = chartTab === "daily" ? dailyData : chartTab === "weekly" ? weeklyData : monthlyData;

  const productRows = useMemo(() => {
    const map = new Map<string, {
      asin: string; brand: string; label: string;
      revenue: number; unitsSold: number; commission: number; rateSum: number; count: number;
    }>();
    filtered.forEach(r => {
      const key = (r.asin ?? "") + "||" + r.brand;
      const e = map.get(key) ?? {
        asin: r.asin ?? "—", brand: r.brand, label: r.storeProductLabel ?? "—",
        revenue: 0, unitsSold: 0, commission: 0, rateSum: 0, count: 0,
      };
      e.revenue += r.revenue; e.unitsSold += r.unitsSold;
      e.commission += r.commission; e.rateSum += r.commissionRate; e.count++;
      map.set(key, e);
    });
    const rows = [...map.values()].map(r => ({ ...r, commissionRate: r.count > 0 ? r.rateSum / r.count : 0 }));
    return rows.sort((a, b) => {
      const av = a[tableSort.k as keyof typeof a] as number;
      const bv = b[tableSort.k as keyof typeof b] as number;
      return tableSort.d === "desc" ? bv - av : av - bv;
    });
  }, [filtered, tableSort]);

  const hasFilters = !!(selBrands.length || selStores.length || selLabels.length || selPrograms.length || dateFrom || dateTo);

  if (salesRecords.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
        暂无推广数据 — 该联盟商尚未与任何销售记录匹配
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-slate-500">筛选：</span>
          <div className="flex items-center gap-1">
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 outline-none focus:border-brand-400"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 outline-none focus:border-brand-400"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
          <MultiSelectDropdown label="品牌" options={allBrands} selected={selBrands} onChange={setSelBrands} />
          <MultiSelectDropdown label="店铺" options={allStores} selected={selStores} onChange={setSelStores} />
          <MultiSelectDropdown label="链接标签" options={allLabels} selected={selLabels} onChange={setSelLabels} />
          <MultiSelectDropdown label="品类/联盟类型" options={allPrograms} selected={selPrograms} onChange={setSelPrograms} />
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setSelBrands([]); setSelStores([]); setSelLabels([]); setSelPrograms([]); setDateFrom(""); setDateTo(""); }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-3 w-3" /> 清除筛选
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400">{filtered.length} / {salesRecords.length} 条记录</span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "销售额", value: formatCurrency(totRevenue), color: "text-brand-700" },
          { label: "销售数量", value: formatNumber(totUnits), color: "text-slate-800" },
          { label: "联盟佣金", value: formatCurrency(totCommission), color: "text-emerald-700" },
          { label: "实际佣金率", value: `${avgRate.toFixed(2)}%`, color: "text-amber-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-700">销售趋势</span>
          <div className="flex gap-1">
            {(["daily", "weekly", "monthly"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setChartTab(t)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  chartTab === t ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {t === "daily" ? "日折线" : t === "weekly" ? "周折线" : "月折线"}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[11px] text-slate-400">{chartData.length} 个数据点</span>
        </div>
        {chartData.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">暂无数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                angle={chartTab === "daily" ? -30 : 0}
                textAnchor={chartTab === "daily" ? "end" : "middle"}
                height={chartTab === "daily" ? 50 : 25}
                interval={chartTab === "daily" ? "preserveStartEnd" : 0}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={65} tickFormatter={v => `$${(v as number).toFixed(0)}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={40} />
              <Tooltip
                formatter={(v: number, name) => name === "销售额" ? formatCurrency(v) : formatNumber(v)}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="revenue" name="销售额" stroke="#3b65f6" strokeWidth={2} dot={{ r: 2 }} yAxisId="left" />
              <Line type="monotone" dataKey="unitsSold" name="销售数量" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} yAxisId="right" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Product table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold text-slate-700">
          产品销售明细 <span className="text-slate-400 font-normal">({productRows.length} 个 ASIN · 点击表头排序)</span>
        </p>
        <div className="overflow-x-auto">
          <table className="data w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th>ASIN</th>
                <th>品牌</th>
                <th>链接标签</th>
                <SortTh label="销售金额" sk="revenue" sort={tableSort} onSort={k => setTableSort(toggleSort(tableSort, k))} right />
                <SortTh label="销售数量" sk="unitsSold" sort={tableSort} onSort={k => setTableSort(toggleSort(tableSort, k))} right />
                <SortTh label="联盟佣金" sk="commission" sort={tableSort} onSort={k => setTableSort(toggleSort(tableSort, k))} right />
                <SortTh label="实际佣金率" sk="commissionRate" sort={tableSort} onSort={k => setTableSort(toggleSort(tableSort, k))} right />
              </tr>
            </thead>
            <tbody>
              {productRows.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-slate-400">暂无数据</td></tr>
              ) : (
                productRows.map((row, i) => (
                  <tr key={i}>
                    <td className="font-mono text-slate-500">{row.asin}</td>
                    <td className="font-medium">{row.brand}</td>
                    <td className="text-slate-400">{row.label}</td>
                    <td className="text-right">{formatCurrency(row.revenue)}</td>
                    <td className="text-right">{formatNumber(row.unitsSold)}</td>
                    <td className="text-right text-emerald-600">{formatCurrency(row.commission)}</td>
                    <td className="text-right">{(row.commissionRate * 100).toFixed(2)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
