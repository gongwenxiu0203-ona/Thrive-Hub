"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ExternalLink, Search, X, ChevronLeft, ChevronRight, ChevronDown, CheckSquare } from "lucide-react";
import { AFFILIATE_DEV_STATUS_COLORS, AFFILIATE_SOURCE_OPTIONS, AFFILIATE_CATEGORY_OPTIONS,
  AFFILIATE_TYPE_OPTIONS, AFFILIATE_TAG_OPTIONS, AFFILIATE_DEV_STATUS_OPTIONS,
  COOPERATION_MODE_OPTIONS, REGION_OPTIONS } from "@/lib/constants";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface AffiliateRow {
  id: string;
  platformAffiliateName: string;
  internalAffiliateName: string | null;
  source: string | null;
  category: string | null;
  affiliateType: string | null;
  tags: string;
  developmentStatus: string | null;
  cooperationMode: string;
  insFollowers: number | null;
  youtubeFollowers: number | null;
  tiktokFollowers: number | null;
  instagramLink: string | null;
  tiktokLink: string | null;
  youtubeLink: string | null;
  websiteLink: string | null;
  personInCharge: { id: string; name: string } | null;
}

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
    names: string[];
    pics: string[];
    users: { id: string; name: string }[];
  };
}

const toOpts = (xs: string[]) => xs.filter(Boolean).map((v) => ({ value: v, label: v }));
const PAGE_SIZE = 50;

// Batch-editable fields config
const BATCH_FIELDS = [
  { value: "region",           label: "地区",          type: "select", opts: REGION_OPTIONS },
  { value: "personInChargeId", label: "负责人",         type: "user" },
  { value: "source",           label: "联盟商来源",     type: "select", opts: AFFILIATE_SOURCE_OPTIONS },
  { value: "category",         label: "一级类目",       type: "select", opts: AFFILIATE_CATEGORY_OPTIONS },
  { value: "affiliateType",    label: "联盟商类型",     type: "select", opts: AFFILIATE_TYPE_OPTIONS },
  { value: "tags",             label: "联盟商标签(追加)", type: "multi", opts: AFFILIATE_TAG_OPTIONS },
  { value: "brand",            label: "关联品牌",       type: "brand" },
  { value: "developmentStatus",label: "开发状态",       type: "select", opts: AFFILIATE_DEV_STATUS_OPTIONS },
  { value: "cooperationMode",  label: "合作模式(追加)", type: "multi", opts: COOPERATION_MODE_OPTIONS },
] as const;

function SortableHeader({ label, sortKey: key, current, dir, onSort }: {
  label: string; sortKey: string; current: string | null; dir: "asc" | "desc"; onSort: (k: string) => void;
}) {
  const active = current === key;
  return (
    <th className="whitespace-nowrap py-3 px-3 text-left text-xs font-medium text-slate-500 cursor-pointer select-none hover:text-slate-800 group"
      onClick={() => onSort(key)}>
      <span className="flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? "text-brand-600" : "text-slate-300 group-hover:text-slate-400"}`}>
          {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </span>
    </th>
  );
}

// Multi-option picker for batch field (tags / cooperationMode)
function MultiPicker({ opts, values, onChange }: {
  opts: readonly string[]; values: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex h-[30px] items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs min-w-[130px] hover:border-brand-400">
        <span className="flex-1 text-left text-slate-600 truncate">
          {values.length ? values.join(", ") : "选择…"}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-[60] max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl p-1.5 min-w-[200px]">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs">
              <input type="checkbox" className="shrink-0" checked={values.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...values, o] : values.filter((v) => v !== o))} />
              <span className="leading-tight">{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AffiliateListTab({ options }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [data, setData] = useState<AffiliateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dateFromVal, setDateFromVal] = useState(sp.get("dateFrom") ?? "");
  const [dateToVal, setDateToVal] = useState(sp.get("dateTo") ?? "");

  // Batch edit state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchField, setBatchField] = useState("");
  const [batchValue, setBatchValue] = useState("");
  const [batchValues, setBatchValues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const page = parseInt(sp.get("page") ?? "1", 10);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setDateFromVal(sp.get("dateFrom") ?? "");
    setDateToVal(sp.get("dateTo") ?? "");
  }, [sp]);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams(sp.toString());
    if (q) p.set("q", q); else p.delete("q");
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p;
  }, [sp, q, page]);

  const fetchData = useCallback(() => {
    setLoading(true);
    const p = buildQuery();
    fetch(`/api/affiliates?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => { setData(d.data ?? []); setTotal(d.total ?? 0); })
      .finally(() => setLoading(false));
  }, [buildQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSearch(val: string) {
    setQ(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const p = new URLSearchParams(sp.toString());
      if (val) p.set("q", val); else p.delete("q");
      p.delete("page");
      router.push(`${pathname}?${p.toString()}`);
    }, 400);
  }

  function goPage(n: number) {
    const p = new URLSearchParams(sp.toString());
    p.set("page", String(n));
    router.push(`${pathname}?${p.toString()}`);
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); }
    } else { setSortKey(key); setSortDir("asc"); }
  }

  const sorted = sortKey ? [...data].sort((a, b) => {
    let av: string | number | null = null, bv: string | number | null = null;
    if (sortKey === "platformAffiliateName") { av = a.platformAffiliateName; bv = b.platformAffiliateName; }
    else if (sortKey === "affiliateType") { av = a.affiliateType ?? ""; bv = b.affiliateType ?? ""; }
    else if (sortKey === "developmentStatus") { av = a.developmentStatus ?? ""; bv = b.developmentStatus ?? ""; }
    else if (sortKey === "personInCharge") { av = a.personInCharge?.name ?? ""; bv = b.personInCharge?.name ?? ""; }
    else if (sortKey === "insFollowers") { av = a.insFollowers ?? -1; bv = b.insFollowers ?? -1; }
    else if (sortKey === "tiktokFollowers") { av = a.tiktokFollowers ?? -1; bv = b.tiktokFollowers ?? -1; }
    else if (sortKey === "youtubeFollowers") { av = a.youtubeFollowers ?? -1; bv = b.youtubeFollowers ?? -1; }
    if (av === null || av === bv) return 0;
    if (typeof av === "number") return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  }) : data;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allPageSelected = sorted.length > 0 && sorted.every((r) => selectedIds.has(r.id));

  function toggleAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); sorted.forEach((r) => next.delete(r.id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); sorted.forEach((r) => next.add(r.id)); return next; });
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function resetBatch() {
    setSelectedIds(new Set());
    setBatchField("");
    setBatchValue("");
    setBatchValues([]);
  }

  async function saveBatch() {
    const cfg = BATCH_FIELDS.find((f) => f.value === batchField);
    if (!cfg) return;
    const isMulti = cfg.type === "multi";
    const val = isMulti ? batchValues : batchValue;
    if (isMulti && batchValues.length === 0) return;
    if (!isMulti && !batchValue) return;

    setSaving(true);
    try {
      const res = await fetch("/api/affiliates/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds], field: batchField, value: val }),
      });
      if (res.ok) { resetBatch(); fetchData(); }
    } finally { setSaving(false); }
  }

  const parseTags = (s: string): string[] => {
    try { return JSON.parse(s) ?? []; } catch { return []; }
  };

  // Render the value input based on selected batch field
  function renderBatchInput() {
    const cfg = BATCH_FIELDS.find((f) => f.value === batchField);
    if (!cfg) return null;
    if (cfg.type === "user") {
      return (
        <select value={batchValue} onChange={(e) => setBatchValue(e.target.value)}
          className="h-[30px] rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option value="">请选择</option>
          {options.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      );
    }
    if (cfg.type === "brand") {
      return (
        <select value={batchValue} onChange={(e) => setBatchValue(e.target.value)}
          className="h-[30px] rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option value="">请选择</option>
          {options.brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      );
    }
    if (cfg.type === "select" && "opts" in cfg) {
      return (
        <select value={batchValue} onChange={(e) => setBatchValue(e.target.value)}
          className="h-[30px] rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option value="">请选择</option>
          {cfg.opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (cfg.type === "multi" && "opts" in cfg) {
      return <MultiPicker opts={cfg.opts} values={batchValues} onChange={setBatchValues} />;
    }
    // text
    return (
      <input value={batchValue} onChange={(e) => setBatchValue(e.target.value)}
        placeholder="输入值…"
        className="h-[30px] w-32 rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索联盟商名称…"
              className="w-full rounded border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            {q && (
              <button onClick={() => handleSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-slate-400" />
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500">共 {total} 条</span>
          {selectedIds.size > 0 && (
            <span className="flex items-center gap-1 text-xs text-brand-600 font-medium">
              <CheckSquare className="h-3.5 w-3.5" />已选 {selectedIds.size} 个
            </span>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <FilterCell label="联盟商名称">
            <MultiSelectFilter paramKey="names" placeholder="请选择" options={toOpts(options.names ?? [])} width="w-full" />
          </FilterCell>
          <FilterCell label="负责人">
            <MultiSelectFilter paramKey="pics" placeholder="请选择" options={toOpts(options.pics ?? [])} width="w-full" />
          </FilterCell>
          <FilterCell label="联盟商来源">
            <MultiSelectFilter paramKey="sources" placeholder="请选择" options={toOpts(options.sources)} width="w-full" />
          </FilterCell>
          <FilterCell label="一级类目">
            <MultiSelectFilter paramKey="categories" placeholder="请选择" options={toOpts(options.categories)} width="w-full" />
          </FilterCell>
          <FilterCell label="联盟商类型 Type">
            <MultiSelectFilter paramKey="types" placeholder="请选择" options={toOpts(options.types)} width="w-full" />
          </FilterCell>
          <FilterCell label="联盟商标签">
            <MultiSelectFilter paramKey="tags" placeholder="请选择" options={toOpts(options.tags)} width="w-full" />
          </FilterCell>
          <FilterCell label="品牌 Brand">
            <MultiSelectFilter paramKey="brands" placeholder="请选择" options={toOpts(options.brands ?? [])} width="w-full" />
          </FilterCell>
          <FilterCell label="开发状态Status">
            <MultiSelectFilter paramKey="statuses" placeholder="请选择" options={toOpts(options.statuses)} width="w-full" />
          </FilterCell>
          <FilterCell label="合作模式">
            <MultiSelectFilter paramKey="modes" placeholder="请选择" options={toOpts(options.modes)} width="w-full" />
          </FilterCell>
          <FilterCell label="地区 Region">
            <MultiSelectFilter paramKey="regions" placeholder="请选择" options={toOpts([...REGION_OPTIONS])} width="w-full" />
          </FilterCell>
        </div>
        {/* Date range */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          <span className="shrink-0 text-[11px] text-slate-500">新增起止时间</span>
          <input type="date" value={dateFromVal} onChange={(e) => setDateFromVal(e.target.value)}
            className="h-[30px] rounded border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <span className="text-xs text-slate-400">—</span>
          <input type="date" value={dateToVal} onChange={(e) => setDateToVal(e.target.value)}
            className="h-[30px] rounded border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <button onClick={() => {
            const p = new URLSearchParams(sp.toString());
            if (dateFromVal) p.set("dateFrom", dateFromVal); else p.delete("dateFrom");
            if (dateToVal) p.set("dateTo", dateToVal); else p.delete("dateTo");
            p.delete("page");
            router.push(`${pathname}?${p.toString()}`);
          }} className="h-[30px] rounded bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700">
            确定
          </button>
          {(sp.get("dateFrom") || sp.get("dateTo")) && (
            <button onClick={() => {
              setDateFromVal(""); setDateToVal("");
              const p = new URLSearchParams(sp.toString());
              p.delete("dateFrom"); p.delete("dateTo"); p.delete("page");
              router.push(`${pathname}?${p.toString()}`);
            }} className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-rose-500">
              <X className="h-3 w-3" />清除日期
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              {/* Select-all checkbox */}
              <th className="w-8 px-3 py-3">
                <input type="checkbox" checked={allPageSelected} onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-brand-600" />
              </th>
              <SortableHeader label="平台联盟商名称" sortKey="platformAffiliateName" current={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-4 py-2.5 text-left font-medium">内部名称</th>
              <th className="px-4 py-2.5 text-left font-medium">来源</th>
              <th className="px-4 py-2.5 text-left font-medium">类目</th>
              <SortableHeader label="联盟商类型" sortKey="affiliateType" current={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-4 py-2.5 text-left font-medium">标签</th>
              <th className="px-4 py-2.5 text-left font-medium">社媒粉丝(K)</th>
              <SortableHeader label="开发状态" sortKey="developmentStatus" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableHeader label="负责人" sortKey="personInCharge" current={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-4 py-2.5 text-left font-medium">链接</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="py-10 text-center text-slate-400">加载中…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={11} className="py-10 text-center text-slate-400">暂无数据</td></tr>
            ) : sorted.map((a) => {
              const tags = parseTags(a.tags);
              const statusColor = AFFILIATE_DEV_STATUS_COLORS[a.developmentStatus ?? ""] ?? "bg-slate-100 text-slate-600";
              const checked = selectedIds.has(a.id);
              return (
                <tr key={a.id}
                  className={`border-b border-slate-50 transition-colors hover:bg-slate-50/50 ${checked ? "bg-indigo-50/40" : ""}`}>
                  <td className="w-8 px-3 py-2.5">
                    <input type="checkbox" checked={checked} onChange={() => toggleRow(a.id)}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-brand-600" />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    <Link href={`/affiliates/${a.id}`} className="hover:text-brand-600 hover:underline">
                      {a.platformAffiliateName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{a.internalAffiliateName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{a.source ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{a.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-[160px] truncate" title={a.affiliateType ?? ""}>{a.affiliateType ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {tags.slice(0, 2).map((t) => (
                        <span key={t} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600">{t}</span>
                      ))}
                      {tags.length > 2 && <span className="text-[10px] text-slate-400">+{tags.length - 2}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {[
                      a.insFollowers ? `INS ${a.insFollowers}K` : null,
                      a.youtubeFollowers ? `YT ${a.youtubeFollowers}K` : null,
                      a.tiktokFollowers ? `TK ${a.tiktokFollowers}K` : null,
                    ].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.developmentStatus ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor}`}>
                        {a.developmentStatus}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{a.personInCharge?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5">
                      {a.instagramLink && <SocialLink href={a.instagramLink} label="INS" />}
                      {a.tiktokLink && <SocialLink href={a.tiktokLink} label="TK" />}
                      {a.youtubeLink && <SocialLink href={a.youtubeLink} label="YT" />}
                      {a.websiteLink && <SocialLink href={a.websiteLink} label="WEB" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <button disabled={page <= 1} onClick={() => goPage(page - 1)} className="rounded p-1 disabled:opacity-30 hover:bg-slate-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-slate-600">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => goPage(page + 1)} className="rounded p-1 disabled:opacity-30 hover:bg-slate-100">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Floating batch edit toolbar ────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xl">
          <span className="text-sm font-semibold text-brand-700">已选 {selectedIds.size} 个</span>
          <div className="h-4 w-px bg-slate-200" />
          <span className="text-xs text-slate-500 shrink-0">批量修改：</span>

          {/* Field selector */}
          <select value={batchField}
            onChange={(e) => { setBatchField(e.target.value); setBatchValue(""); setBatchValues([]); }}
            className="h-[30px] rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">选择字段</option>
            {BATCH_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>

          {/* Value input */}
          {batchField && renderBatchInput()}

          {/* Save */}
          {batchField && (
            <button onClick={saveBatch} disabled={saving}
              className="h-[30px] rounded bg-brand-600 px-4 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 shrink-0">
              {saving ? "保存中…" : "保存"}
            </button>
          )}

          {/* Close */}
          <button onClick={resetBatch} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function FilterCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700">
      {label}<ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}
