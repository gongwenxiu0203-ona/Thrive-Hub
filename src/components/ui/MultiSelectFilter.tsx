"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  Clipboard,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

/**
 * URL-param backed multi-select filter with **search + bulk-paste** support.
 * Paste a newline / comma / tab separated list of values to select them all
 * at once. `options` should be recomputed by the parent on every render so
 * the choices cascade with other active filters.
 */
export function MultiSelectFilter({
  paramKey,
  placeholder,
  options,
  width = "min-w-[10rem]",
}: {
  paramKey: string;
  placeholder: string;
  options: Option[];
  width?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () =>
      (params.get(paramKey) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [params, paramKey],
  );
  const [draft, setDraft] = useState<string[]>(selected);
  useEffect(() => setDraft(selected), [selected]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        commit(draft);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  function commit(next: string[]) {
    const sp = new URLSearchParams(params.toString());
    const cleaned = next.filter(Boolean);
    if (cleaned.length) sp.set(paramKey, cleaned.join(","));
    else sp.delete(paramKey);
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  }

  function toggle(value: string) {
    setDraft((d) =>
      d.includes(value) ? d.filter((v) => v !== value) : [...d, value],
    );
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const needle = q.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) ||
        o.value.toLowerCase().includes(needle),
    );
  }, [q, options]);

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!/[\n,;\t]/.test(text)) return; // single value → let search work
    e.preventDefault();
    const values = text
      .split(/[\n,;\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const byLower = new Map<string, string>();
    for (const o of options) {
      byLower.set(o.value.toLowerCase(), o.value);
      byLower.set(o.label.toLowerCase(), o.value);
    }
    const matched = values
      .map((v) => byLower.get(v.toLowerCase()))
      .filter((x): x is string => !!x);
    if (matched.length) {
      setDraft((d) => Array.from(new Set([...d, ...matched])));
    }
  }

  function selectAllFiltered() {
    setDraft((d) =>
      Array.from(new Set([...d, ...filtered.map((o) => o.value)])),
    );
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${placeholder}（${selected.length}）`;

  return (
    <div className={cn("relative", width)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition",
          selected.length
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-slate-300 bg-white text-slate-600",
        )}
      >
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-1">
          {selected.length > 0 && (
            <X
              className="h-3.5 w-3.5 hover:text-rose-600"
              onClick={(e) => {
                e.stopPropagation();
                commit([]);
              }}
            />
          )}
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-1 border-b border-slate-100 p-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              autoFocus
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="查找 / 粘贴多个值..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onPaste={handlePaste}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 text-xs text-slate-500">
            <span>
              已选 <b className="text-slate-800">{draft.length}</b> /{" "}
              {options.length}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-brand-600 hover:underline"
                title="选中当前筛选结果"
              >
                全选
              </button>
              <button
                type="button"
                onClick={() => setDraft([])}
                className="text-slate-500 hover:underline"
              >
                清空
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-400">
                无匹配项
              </p>
            ) : (
              filtered.map((o) => {
                const active = draft.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        active
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-slate-300",
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate text-slate-700">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 p-2">
            <p className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clipboard className="h-3 w-3" /> 支持批量粘贴（换行/逗号/Tab分隔）
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setDraft(selected);
                  setOpen(false);
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => {
                  commit(draft);
                  setOpen(false);
                }}
              >
                应用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
