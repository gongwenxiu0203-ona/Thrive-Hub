"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import { DateRangeFilter } from "./DateRangeFilter";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import { EMPTY_FILTER_VALUE } from "@/lib/salesRecordFilters";

const FILTER_KEYS = [
  "platforms",
  "programs",
  "brands",
  "regions",
  "stores",
  "affiliateNames",
  "types",
  "asins",
  "parentAsins",
  "labels",
  "from",
  "to",
  "rateMin",
  "rateMax",
] as const;

export type FilterOptions = {
  platforms: string[];
  programs: string[];
  brands: string[];
  regions: string[];
  stores: string[];
  affiliateNames: string[];
  types: string[];
  asins: string[];
  parentAsins: string[];
  labels: string[];
};

export function BIFilters({
  options,
  isChannel = false,
}: {
  options: FilterOptions;
  isChannel?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Local state for rate range inputs (string to allow partial typing)
  const [rateMin, setRateMin] = useState(sp.get("rateMin") ?? "");
  const [rateMax, setRateMax] = useState(sp.get("rateMax") ?? "");

  // Sync local state if URL params change externally (e.g. clearAll)
  useEffect(() => {
    setRateMin(sp.get("rateMin") ?? "");
    setRateMax(sp.get("rateMax") ?? "");
  }, [sp]);

  function applyRateFilter() {
    const next = new URLSearchParams(sp.toString());
    if (rateMin) next.set("rateMin", rateMin); else next.delete("rateMin");
    if (rateMax) next.set("rateMax", rateMax); else next.delete("rateMax");
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  function clearAll() {
    const next = new URLSearchParams(sp.toString());
    for (const k of FILTER_KEYS) next.delete(k);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const hasAny = FILTER_KEYS.some((k) => sp.get(k));

  const toOpts = (xs: string[]) => [
    { value: EMPTY_FILTER_VALUE, label: "（空）" },
    ...xs.filter(Boolean).map((v) => ({ value: v, label: v })),
  ];

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">筛选器</h2>
        {hasAny && (
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600"
          >
            <X className="h-3 w-3" />
            清空全部
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <FilterCell label="订单日期 Order Date">
          <DateRangeFilter />
        </FilterCell>
        {!isChannel && (
          <FilterCell label="联盟平台 Affiiate Network Platform">
            <MultiSelectFilter
              paramKey="platforms"
              placeholder="请选择"
              options={toOpts(options.platforms)}
              width="w-full"
            />
          </FilterCell>
        )}
        {!isChannel && (
          <FilterCell label="联盟类型 Affiliate Program">
            <MultiSelectFilter
              paramKey="programs"
              placeholder="请选择"
              options={toOpts(options.programs)}
              width="w-full"
            />
          </FilterCell>
        )}
        <FilterCell label="品牌 Brand">
          <MultiSelectFilter
            paramKey="brands"
            placeholder="请选择"
            options={toOpts(options.brands)}
            width="w-full"
          />
        </FilterCell>
        <FilterCell label="地区 Region">
          <MultiSelectFilter
            paramKey="regions"
            placeholder="请选择"
            options={toOpts(options.regions)}
            width="w-full"
          />
        </FilterCell>
        {!isChannel && (
          <FilterCell label="平台联盟商名称 Affiliate Name on Network">
            <MultiSelectFilter
              paramKey="affiliateNames"
              placeholder="请选择"
              options={toOpts(options.affiliateNames)}
              width="w-full"
            />
          </FilterCell>
        )}
        {!isChannel && (
          <FilterCell label="联盟商类型 Type">
            <MultiSelectFilter
              paramKey="types"
              placeholder="请选择"
              options={toOpts(options.types)}
              width="w-full"
            />
          </FilterCell>
        )}
        <FilterCell label="店铺">
          <MultiSelectFilter
            paramKey="stores"
            placeholder="请选择"
            options={toOpts(options.stores)}
            width="w-full"
          />
        </FilterCell>
        {!isChannel && (
          <FilterCell label="ASIN">
            <MultiSelectFilter
              paramKey="asins"
              placeholder="请选择"
              options={toOpts(options.asins)}
              width="w-full"
            />
          </FilterCell>
        )}
        {!isChannel && (
          <FilterCell label="Parent Asin">
            <MultiSelectFilter
              paramKey="parentAsins"
              placeholder="请选择"
              options={toOpts(options.parentAsins)}
              width="w-full"
            />
          </FilterCell>
        )}
        {!isChannel && (
          <FilterCell label="链接标签 Store-Product Label">
            <MultiSelectFilter
              paramKey="labels"
              placeholder="请选择"
              options={toOpts(options.labels)}
              width="w-full"
            />
          </FilterCell>
        )}
        {!isChannel && (
          <FilterCell label="佣金比例范围（%）">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder="下限"
                className="input w-full text-sm"
                value={rateMin}
                onChange={(e) => setRateMin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyRateFilter()}
              />
              <span className="shrink-0 text-slate-400">—</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder="上限"
                className="input w-full text-sm"
                value={rateMax}
                onChange={(e) => setRateMax(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyRateFilter()}
              />
              <button
                type="button"
                onClick={applyRateFilter}
                className="btn-primary btn-sm shrink-0"
              >
                确定
              </button>
            </div>
          </FilterCell>
        )}
      </div>
    </div>
  );
}

function FilterCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-slate-500">{label}</p>
      {children}
    </div>
  );
}
