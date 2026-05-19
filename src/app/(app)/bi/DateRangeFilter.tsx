"use client";

import { useFilters } from "@/components/ui/Filters";

export function DateRangeFilter() {
  const { params, setParam } = useFilters();
  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        className="input w-auto"
        value={params.get("from") ?? ""}
        onChange={(e) => setParam("from", e.target.value)}
        aria-label="起始日期"
      />
      <span className="text-slate-400">~</span>
      <input
        type="date"
        className="input w-auto"
        value={params.get("to") ?? ""}
        onChange={(e) => setParam("to", e.target.value)}
        aria-label="结束日期"
      />
    </div>
  );
}
