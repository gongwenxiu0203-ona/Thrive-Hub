"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search } from "lucide-react";

/** URL-search-param backed filter controls used across list pages. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>
  );
}

export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  return { params, setParam };
}

export function SelectFilter({
  paramKey,
  placeholder,
  options,
}: {
  paramKey: string;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  const { params, setParam } = useFilters();
  return (
    <select
      className="input w-auto min-w-[9rem]"
      value={params.get(paramKey) ?? ""}
      onChange={(e) => setParam(paramKey, e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SearchFilter({
  paramKey = "q",
  placeholder = "搜索…",
}: {
  paramKey?: string;
  placeholder?: string;
}) {
  const { params, setParam } = useFilters();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="input w-56 pl-8"
        placeholder={placeholder}
        defaultValue={params.get(paramKey) ?? ""}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setParam(paramKey, (e.target as HTMLInputElement).value);
          }
        }}
      />
    </div>
  );
}
