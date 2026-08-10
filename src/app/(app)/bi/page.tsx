import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { BIFilters, type FilterOptions } from "./BIFilters";
import { SalesDashboard } from "./SalesCharts";
import { UploadPanel } from "./UploadPanel";
import { CleanupPanel } from "./CleanupPanel";
import { AsinMappingPanel } from "./AsinMappingPanel";
import { SalesDetailTable, type SalesDetailRecord } from "./SalesDetailTable";
import { formatCurrencyWith, formatCurrency, getCurrencyCode, currencySymbol, formatNumber, formatDateTime, cn } from "@/lib/utils";
import { requireSession } from "@/lib/session";
import {
  buildSalesRecordWhereFromParams,
  csvFilterValues,
  exportSalesFilterQueryString,
  EMPTY_FILTER_VALUE,
} from "@/lib/salesRecordFilters";
import { activeSalesRecordWhere } from "@/lib/activeSalesScope";

export const metadata = { title: "推广数据BI · Thraive联盟营销系统" };

const ALL_TABS = [
  { key: "dashboard", label: "销售看板" },
  { key: "detail", label: "明细数据" },
  { key: "upload", label: "数据上传" },
  { key: "cleanup", label: "数据清理" },
  { key: "asin", label: "ASIN 匹配" },
];

// Roles treated as full-access staff
function isStaff(role: string) {
  return role === "ADMIN" || role === "USER";
}

const PAGE_SIZE = 50;
// Filter options are shared by all BI tabs. Keep the derived values briefly so
// repeated tab switches do not rebuild the same option lists from raw records.
const BI_FILTER_CACHE_TTL_MS = 60 * 1000;
const BI_DASHBOARD_CACHE_TTL_MS = 45 * 1000;

type AffTypeRow = { platformAffiliateName: string; affiliateType: string | null };
type BiFilterContext = {
  filterOptions: FilterOptions;
  affLibrary: AffTypeRow[];
};
type UploadBatchRow = {
  id: string;
  fileName: string;
  recordCount: number;
  affiliatePlatform: string | null;
  customer: { brandName: string } | null;
  uploader: { name: string };
  createdAt: Date;
};

const biFilterCache = new Map<string, { expiresAt: number; value: BiFilterContext }>();
const biDashboardRecordCache = new Map<string, { expiresAt: number; value: DashboardRecord[] }>();
const biDashboardAffiliateCache = new Map<string, { expiresAt: number; value: DashboardAffiliate[] }>();

const dashboardRecordSelect = {
  orderDate: true,
  affiliatePlatform: true,
  affiliateProgram: true,
  brand: true,
  affiliateName: true,
  affiliateType: true,
  asin: true,
  parentAsin: true,
  storeProductLabel: true,
  revenue: true,
  commission: true,
  commissionRate: true,
  totalFee: true,
  unitsSold: true,
  clicks: true,
} satisfies Prisma.SalesRecordSelect;

type DashboardRecord = Prisma.SalesRecordGetPayload<{ select: typeof dashboardRecordSelect }>;
type DashboardAffiliate = {
  platformAffiliateName: string;
  internalAffiliateName: string | null;
  affiliateType: string | null;
  promoContents: string;
};

/**
 * Builds a function that resolves an affiliate's type from the affiliate
 * library, with case-sensitive match first and lowercase fallback.
 * Falls back to the stored value if no library entry found.
 */
function buildAffTypeResolver(
  affiliates: AffTypeRow[],
) {
  const exact = new Map<string, string>();
  const lower = new Map<string, string>();
  for (const a of affiliates) {
    const type = (a.affiliateType ?? "").trim();
    if (type) {
      exact.set(a.platformAffiliateName.trim(), type);
      lower.set(a.platformAffiliateName.trim().toLowerCase(), type);
    }
  }
  return (name: string, stored?: string | null): string => {
    const n = (name ?? "").trim();
    if (n) {
      const e = exact.get(n);
      if (e) return e;
      const l = lower.get(n.toLowerCase());
      if (l) return l;
    }
    return (stored ?? "").trim();
  };
}

function stableCacheKey(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableCacheKey).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableCacheKey(obj[key])}`)
    .join(",")}}`;
}

async function getDashboardRecords(where: Prisma.SalesRecordWhereInput): Promise<DashboardRecord[]> {
  const key = stableCacheKey(where);
  const cached = biDashboardRecordCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await prisma.salesRecord.findMany({
    where,
    orderBy: { orderDate: "asc" },
    // The dashboard aggregates these fields only. Selecting the full record
    // serializes dozens of unused fields for every sales row.
    select: dashboardRecordSelect,
  });
  biDashboardRecordCache.set(key, {
    expiresAt: Date.now() + BI_DASHBOARD_CACHE_TTL_MS,
    value,
  });
  return value;
}

async function getDashboardAffiliates(): Promise<DashboardAffiliate[]> {
  const key = "promotion-content";
  const cached = biDashboardAffiliateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = await (prisma.affiliate.findMany as any)({
    where: { deletedAt: null },
    select: {
      platformAffiliateName: true,
      internalAffiliateName: true,
      affiliateType: true,
      promoContents: true,
    },
  }) as DashboardAffiliate[];
  biDashboardAffiliateCache.set(key, {
    expiresAt: Date.now() + BI_DASHBOARD_CACHE_TTL_MS,
    value,
  });
  return value;
}

async function getBiFilterContext(baseWhere: Prisma.SalesRecordWhereInput): Promise<BiFilterContext> {
  const key = stableCacheKey(baseWhere);
  const now = Date.now();
  const cached = biFilterCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const [
    platforms,
    programs,
    brands,
    regions,
    stores,
    affiliatePairs,
    asins,
    parentAsins,
    labels,
    affLibrary,
  ] = await Promise.all([
    prisma.salesRecord.groupBy({ where: baseWhere, by: ["affiliatePlatform"] }),
    prisma.salesRecord.groupBy({ where: baseWhere, by: ["affiliateProgram"] }),
    prisma.salesRecord.groupBy({ where: baseWhere, by: ["brand"] }),
    prisma.salesRecord.groupBy({ where: baseWhere, by: ["region"] }),
    prisma.salesRecord.groupBy({ where: baseWhere, by: ["store"] }),
    prisma.salesRecord.groupBy({ where: baseWhere, by: ["affiliateName", "affiliateType"] }),
    prisma.salesRecord.groupBy({ where: baseWhere, by: ["asin"] }),
    prisma.salesRecord.groupBy({ where: baseWhere, by: ["parentAsin"] }),
    prisma.salesRecord.groupBy({ where: baseWhere, by: ["storeProductLabel"] }),
    prisma.affiliate.findMany({
      where: { deletedAt: null },
      select: { platformAffiliateName: true, affiliateType: true },
    }),
  ]);
  const resolveTypePage = buildAffTypeResolver(affLibrary);
  const uniq = (xs: (string | null)[]) =>
    [...new Set(xs.filter((x): x is string => !!x && x.trim() !== ""))].sort();

  const value: BiFilterContext = {
    affLibrary,
    filterOptions: {
      platforms: uniq(platforms.map((r) => r.affiliatePlatform)),
      programs: uniq(programs.map((r) => r.affiliateProgram)),
      brands: uniq(brands.map((r) => r.brand)),
      regions: uniq(regions.map((r) => r.region)),
      stores: uniq(stores.map((r) => r.store)),
      affiliateNames: uniq(affiliatePairs.map((r) => r.affiliateName)),
      // Resolve types from the affiliate library so the dropdown shows current
      // types even if stored affiliateType fields are empty.
      types: uniq(affiliatePairs.map((r) => resolveTypePage(r.affiliateName, r.affiliateType))),
      asins: uniq(asins.map((r) => r.asin)),
      parentAsins: uniq(parentAsins.map((r) => r.parentAsin)),
      labels: uniq(labels.map((r) => r.storeProductLabel)),
    },
  };
  biFilterCache.set(key, { expiresAt: now + BI_FILTER_CACHE_TTL_MS, value });
  return value;
}

export default async function BIPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const role = session.role;
  const brandName = session.brandName ?? null;
  if (role === "CHANNEL" && !sp.from && !sp.to) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, "0");
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (value) params.set(key, value);
    }
    params.set("from", `${year}-${month}-01`);
    params.set("to", `${year}-${month}-${lastDay}`);
    if (!params.get("tab")) params.set("tab", "dashboard");
    redirect(`/bi?${params.toString()}`);
  }

  // Determine accessible tabs
  const TABS = isStaff(role)
    ? ALL_TABS
    : ALL_TABS.filter((t) => t.key === "dashboard");

  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "dashboard";

  // Build base where clause — restrict by role
  // 同时排除已软删除（回收站）批次的销售记录
  const baseWhere: Prisma.SalesRecordWhereInput = activeSalesRecordWhere();
  if (role === "BRAND" && brandName) {
    baseWhere.brand = brandName;
  }
  if (role === "CHANNEL") {
    // Get customer IDs for this channel user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelCustomers = await (prisma.customer.findMany as any)({
      where: {
        deletedAt: null,
        OR: [
          { createdById: session.userId },
          { channelUserId: session.userId },
        ],
      },
      select: { id: true },
    }) as { id: string }[];
    const customerIds = channelCustomers.map((c) => c.id);
    // If no customers, use a never-matching filter (empty IN list)
    baseWhere.customerId = { in: customerIds };
  }

  const needsBiData = tab === "dashboard" || tab === "detail" || tab === "cleanup";
  let filterContext: BiFilterContext | null = null;
  let where: Prisma.SalesRecordWhereInput | null = null;
  if (needsBiData) {
    filterContext = await getBiFilterContext(baseWhere);
    const resolveTypePage = buildAffTypeResolver(filterContext.affLibrary);

    // Build type-aware WHERE clause: use affiliate library lookup so that records
    // whose affiliateType was not stored but is now resolvable are still matched.
    const typeFilter = csvFilterValues(sp, "types").filter((v) => v !== EMPTY_FILTER_VALUE);
    const typeAffNames = typeFilter.length
      ? filterContext.affLibrary
          .filter((a) => typeFilter.includes(resolveTypePage(a.platformAffiliateName, null)))
          .map((a) => a.platformAffiliateName.trim())
      : undefined;
    const userWhere = buildSalesRecordWhereFromParams(sp, typeAffNames);
    where = {
      AND: [baseWhere, userWhere],
    };
  }

  // For CHANNEL role: only show limited filters
  const isChannel = role === "CHANNEL";
  const isBrand = role === "BRAND";

  return (
    <div className="space-y-4">
      <PageHeader
        title="推广数据 BI"
        description="联盟推广销售数据的导入、可视化分析与字段映射管理"
        actions={
          isStaff(role) && (tab === "dashboard" || tab === "detail") && (
            <a
              href={`/api/sales/export?${exportSalesFilterQueryString(sp)}`}
              className="btn-secondary"
            >
              <Download className="h-4 w-4" /> 导出当前筛选
            </a>
          )
        }
      />

      <div className="tab-strip">
        {TABS.map((t) => {
          const active = t.key === tab;
          const params = new URLSearchParams();
          // Preserve filters when switching tabs.
          for (const k of Object.keys(sp)) {
            if (k !== "tab" && k !== "page" && sp[k]) params.set(k, sp[k]!);
          }
          params.set("tab", t.key);
          return (
            <Link
              key={t.key}
              href={`/bi?${params.toString()}`}
              prefetch
              className={cn(
                "tab-trigger",
                active
                  ? "tab-trigger-active"
                  : "",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "dashboard" && (
        <DashboardTab
          filterOptions={filterContext!.filterOptions}
          where={where!}
          affLibrary={filterContext!.affLibrary}
          isChannel={isChannel}
          isBrand={isBrand}
          regions={csvFilterValues(sp, "regions")}
        />
      )}
      {tab === "detail" && isStaff(role) && (
        <DetailTab
          filterOptions={filterContext!.filterOptions}
          where={where!}
          sp={sp}
          affLibrary={filterContext!.affLibrary}
        />
      )}
      {tab === "upload" && isStaff(role) && <UploadTab />}
      {tab === "cleanup" && isStaff(role) && (
        <CleanupTab filterOptions={filterContext!.filterOptions} where={where!} sp={sp} />
      )}
      {tab === "asin" && isStaff(role) && <AsinTab />}
    </div>
  );
}

async function DashboardTab({
  filterOptions,
  where,
  affLibrary,
  isChannel = false,
  isBrand = false,
  regions = [],
}: {
  filterOptions: FilterOptions;
  where: Prisma.SalesRecordWhereInput;
  affLibrary: AffTypeRow[];
  isChannel?: boolean;
  isBrand?: boolean;
  regions?: string[];
}) {
  const [records, affPromo] = await Promise.all([
    getDashboardRecords(where),
    getDashboardAffiliates(),
  ]);
  const resolveType = buildAffTypeResolver(affLibrary);

  // ── 推广内容（反向拉取联盟商资源库的往期推广内容）────────────────────────────
  // 尝试从链接中识别发布时间（/2024/05/13/ 或 2024-05-13 等模式）
  const extractDateFromUrl = (url: string): string => {
    const m1 = url.match(/(20\d{2})[/\-](\d{1,2})[/\-](\d{1,2})/);
    if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
    const m2 = url.match(/(20\d{2})(\d{2})(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    return "";
  };
  const promoContentRows: {
    affiliateName: string;
    affiliateType: string;
    brand: string;
    linkTag: string;
    publishedAt: string;
    promoLink: string;
  }[] = [];
  for (const a of affPromo) {
    let list: { brand?: string; publishedAt?: string; promoLink?: string }[] = [];
    try { list = JSON.parse(a.promoContents ?? "[]"); } catch { list = []; }
    for (const pc of list) {
      const link = (pc.promoLink ?? "").trim();
      if (!pc.brand && !pc.publishedAt && !link) continue;
      promoContentRows.push({
        affiliateName: a.platformAffiliateName ?? "",
        affiliateType: a.affiliateType ?? "",
        brand: pc.brand ?? "",
        linkTag: a.internalAffiliateName ?? "",
        publishedAt: (pc.publishedAt ?? "").trim() || (link ? extractDateFromUrl(link) : ""),
        promoLink: link,
      });
    }
  }
  // 按发布时间降序（空时间排最后）
  promoContentRows.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));

  if (records.length === 0) {
    const emptyChannelOpts: FilterOptions = isChannel
      ? {
          platforms: [],
          programs: [],
          brands: filterOptions.brands,
          regions: filterOptions.regions,
          stores: filterOptions.stores,
          affiliateNames: [],
          types: [],
          asins: [],
          parentAsins: [],
          labels: [],
        }
      : filterOptions;
    return (
      <>
        <BIFilters options={emptyChannelOpts} isChannel={isChannel} />
        <EmptyState
          title="暂无符合条件的销售数据"
          description="清空筛选或在「数据上传」中导入推广销售数据"
        />
      </>
    );
  }

  // KPI totals
  const totalRevenue = records.reduce((s, r) => s + r.revenue, 0);
  const totalCommission = records.reduce((s, r) => s + r.commission, 0);
  const totalUnits = records.reduce((s, r) => s + r.unitsSold, 0);

  // Group helper
  const group = (key: (r: (typeof records)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of records) {
      const k = key(r) || "未知";
      m.set(k, (m.get(k) ?? 0) + r.revenue);
    }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  };

  const programDist = group((r) => r.affiliateProgram ?? "未知");
  const platformDist = group((r) => r.affiliatePlatform);
  const typeDist = group((r) => resolveType(r.affiliateName, r.affiliateType) || "未分类");
  const brandBars = group((r) => r.brand).slice(0, 12);

  // Commission rate distribution: for >= 1% round to integer, for < 1% keep 2 decimal places.
  const rateCounts = new Map<string, number>();
  for (const r of records) {
    const rawPct = r.commissionRate * 100; // convert decimal rate to percentage
    let key: string;
    if (rawPct >= 1) {
      key = `${Math.round(rawPct)}%`;      // integer for >= 1%
    } else if (rawPct > 0) {
      key = `${rawPct.toFixed(2)}%`;       // 2 decimal places for < 1%
    } else {
      key = "0%";
    }
    rateCounts.set(key, (rateCounts.get(key) ?? 0) + 1);
  }
  const commissionRateDist = [...rateCounts.entries()]
    // parseFloat("1.00%") = 1, parseFloat("10.00%") = 10 — correct numeric sort
    .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
    .map(([name, value]) => ({ name, value }));

  // Top creators by revenue
  type CreatorAgg = {
    platform: string;
    program: string;
    name: string;
    type: string;
    revenue: number;
    unitsSold: number;
    commission: number;
    clicks: number;
  };
  const creatorMap = new Map<string, CreatorAgg>();
  for (const r of records) {
    const k = `${r.affiliatePlatform}|${r.affiliateProgram ?? ""}|${r.affiliateName}`;
    const existing = creatorMap.get(k) ?? {
      platform: r.affiliatePlatform,
      program: r.affiliateProgram ?? "",
      name: r.affiliateName,
      type: resolveType(r.affiliateName, r.affiliateType),
      revenue: 0,
      unitsSold: 0,
      commission: 0,
      clicks: 0,
    };
    existing.revenue += r.revenue;
    existing.unitsSold += r.unitsSold;
    existing.commission += r.commission;
    existing.clicks += r.clicks;
    creatorMap.set(k, existing);
  }
  const topCreators = [...creatorMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((c) => ({
      platform: c.platform,
      program: c.program,
      name: c.name,
      type: c.type,
      revenue: Math.round(c.revenue * 100) / 100,
      unitsSold: c.unitsSold,
      commission: Math.round(c.commission * 100) / 100,
      rate: c.revenue > 0 ? c.commission / c.revenue : 0,
      cpa: c.unitsSold > 0 ? c.commission / c.unitsSold : 0,
    }));

  // Products
  type ProductAgg = {
    platform: string;
    program: string;
    label: string;
    brand: string;
    parentAsin: string;
    asin: string;
    revenue: number;
    unitsSold: number;
    commission: number;
  };
  const productMap = new Map<string, ProductAgg>();
  for (const r of records) {
    const k = `${r.affiliatePlatform}|${r.brand}|${r.asin ?? ""}`;
    const existing = productMap.get(k) ?? {
      platform: r.affiliatePlatform,
      program: r.affiliateProgram ?? "",
      label: r.storeProductLabel ?? "",
      brand: r.brand,
      parentAsin: r.parentAsin ?? "",
      asin: r.asin ?? "",
      revenue: 0,
      unitsSold: 0,
      commission: 0,
    };
    existing.revenue += r.revenue;
    existing.unitsSold += r.unitsSold;
    existing.commission += r.commission;
    productMap.set(k, existing);
  }
  const topProducts = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((p) => ({
      ...p,
      revenue: Math.round(p.revenue * 100) / 100,
      commission: Math.round(p.commission * 100) / 100,
      rate: p.revenue > 0 ? p.commission / p.revenue : 0,
      cpa: p.unitsSold > 0 ? p.commission / p.unitsSold : 0,
    }));

  // New affiliates (first-order in window)
  const affiliateFirst = new Map<
    string,
    { revenue: number; firstDate: Date }
  >();
  for (const r of records) {
    const existing = affiliateFirst.get(r.affiliateName);
    if (!existing || r.orderDate < existing.firstDate) {
      affiliateFirst.set(r.affiliateName, {
        revenue: r.revenue,
        firstDate: r.orderDate,
      });
    } else {
      existing.revenue += r.revenue;
    }
  }
  const newAffiliates = [...affiliateFirst.entries()]
    .sort((a, b) => b[1].firstDate.getTime() - a[1].firstDate.getTime())
    .slice(0, 20)
    .map(([name, v]) => ({
      name,
      revenue: Math.round(v.revenue * 100) / 100,
      firstDate: v.firstDate.toISOString().slice(0, 10),
    }));

  // Daily / Weekly / Monthly trend
  const dayMap = new Map<string, { revenue: number; unitsSold: number }>();
  for (const r of records) {
    const d = r.orderDate.toISOString().slice(0, 10);
    const existing = dayMap.get(d) ?? { revenue: 0, unitsSold: 0 };
    existing.revenue += r.revenue;
    existing.unitsSold += r.unitsSold;
    dayMap.set(d, existing);
  }
  const daily = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      revenue: Math.round(v.revenue * 100) / 100,
      unitsSold: v.unitsSold,
    }));

  // Weekly = ISO week-start (Monday)
  const weekMap = new Map<string, { revenue: number; unitsSold: number }>();
  for (const r of records) {
    const d = new Date(r.orderDate);
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    const k = d.toISOString().slice(0, 10);
    const existing = weekMap.get(k) ?? { revenue: 0, unitsSold: 0 };
    existing.revenue += r.revenue;
    existing.unitsSold += r.unitsSold;
    weekMap.set(k, existing);
  }
  const weekly = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      revenue: Math.round(v.revenue * 100) / 100,
      unitsSold: v.unitsSold,
    }));

  const monthMap = new Map<string, { revenue: number; unitsSold: number }>();
  for (const r of records) {
    const k = r.orderDate.toISOString().slice(0, 7);
    const existing = monthMap.get(k) ?? { revenue: 0, unitsSold: 0 };
    existing.revenue += r.revenue;
    existing.unitsSold += r.unitsSold;
    monthMap.set(k, existing);
  }
  const monthly = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      revenue: Math.round(v.revenue * 100) / 100,
      unitsSold: v.unitsSold,
    }));

  // Build series-by-key trend matrices (top N keys by total revenue)
  const buildSeries = (keyFn: (r: (typeof records)[number]) => string) => {
    const totals = new Map<string, number>();
    for (const r of records) {
      const k = keyFn(r);
      totals.set(k, (totals.get(k) ?? 0) + r.revenue);
    }
    const top = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);
    const monthly: Record<string, Record<string, number>> = {};
    for (const r of records) {
      const k = keyFn(r);
      if (!top.includes(k)) continue;
      const m = r.orderDate.toISOString().slice(0, 7);
      monthly[m] = monthly[m] ?? {};
      monthly[m][k] = (monthly[m][k] ?? 0) + r.revenue;
    }
    return Object.entries(monthly)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, vals]) => {
        const row: Record<string, string | number> = { month };
        for (const k of top) row[k] = Math.round((vals[k] ?? 0) * 100) / 100;
        return row;
      });
  };
  const publisherTrend = buildSeries((r) => r.affiliateName);
  const brandTrend = buildSeries((r) => r.brand);

  // ACOS trend per brand (totalFee/revenue)
  const acosTotals = new Map<
    string,
    Map<string, { fee: number; rev: number }>
  >();
  for (const r of records) {
    const b = r.brand;
    const m = r.orderDate.toISOString().slice(0, 7);
    const byMonth = acosTotals.get(b) ?? new Map();
    const cell = byMonth.get(m) ?? { fee: 0, rev: 0 };
    cell.fee += r.totalFee;
    cell.rev += r.revenue;
    byMonth.set(m, cell);
    acosTotals.set(b, byMonth);
  }
  const allMonths = [
    ...new Set(records.map((r) => r.orderDate.toISOString().slice(0, 7))),
  ].sort();
  const acosTrend = allMonths.map((m) => {
    const row: Record<string, string | number> = { month: m };
    for (const [b, byMonth] of acosTotals.entries()) {
      const cell = byMonth.get(m);
      row[b] = cell && cell.rev > 0 ? cell.fee / cell.rev : 0;
    }
    return row;
  });

  // For CHANNEL: limit filter options to only 订单日期 + 品牌 + 地区 + 店铺
  const channelFilterOptions: FilterOptions = isChannel
    ? {
        platforms: [],
        programs: [],
        brands: filterOptions.brands,
        regions: filterOptions.regions,
        stores: filterOptions.stores,
        affiliateNames: [],
        types: [],
        asins: [],
        parentAsins: [],
        labels: [],
      }
    : filterOptions;

  const currencyCode = getCurrencyCode(regions);
  const fmtCurrency = (n: number | null | undefined) => formatCurrencyWith(n, currencyCode);
  const sym = currencySymbol(currencyCode);

  // Filter zero-value entries from all chart distributions
  const nonZero = (pairs: { name: string; value: number }[]) =>
    pairs.filter((p) => p.value !== 0);

  return (
    <>
      <BIFilters options={channelFilterOptions} isChannel={isChannel} />

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="总销售额"
          value={fmtCurrency(totalRevenue)}
          icon={<span className="text-base font-bold leading-none">{sym}</span>}
          accent="text-brand-600"
        />
        <StatCard
          label="联盟商佣金"
          value={fmtCurrency(totalCommission)}
          icon={<span className="text-base font-bold leading-none">{sym}</span>}
          accent="text-emerald-600"
        />
        <StatCard
          label="销售数量"
          value={formatNumber(totalUnits)}
          icon={<Package className="h-5 w-5" />}
          accent="text-amber-600"
        />
      </div>

      {!isChannel && (
        <SalesDashboard
          programDist={nonZero(programDist)}
          platformDist={nonZero(platformDist)}
          typeDist={nonZero(typeDist)}
          commissionRateDist={nonZero(commissionRateDist)}
          brandBars={nonZero(brandBars)}
          newAffiliates={newAffiliates}
          topCreators={topCreators}
          topProducts={topProducts}
          daily={daily}
          weekly={weekly}
          monthly={monthly}
          publisherTrend={publisherTrend}
          brandTrend={brandTrend}
          acosTrend={acosTrend}
          currencyCode={currencyCode}
          promoContentRows={promoContentRows}
        />
      )}
    </>
  );
}

async function DetailTab({
  filterOptions,
  where,
  sp,
  affLibrary,
}: {
  filterOptions: FilterOptions;
  where: Prisma.SalesRecordWhereInput;
  sp: Record<string, string | undefined>;
  affLibrary: AffTypeRow[];
}) {
  const page = Math.max(1, Number(sp.page) || 1);
  const [records, total, customers] = await Promise.all([
    prisma.salesRecord.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.salesRecord.count({ where }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { brandName: "asc" },
      select: { id: true, brandName: true },
    }),
  ]);
  const resolveType = buildAffTypeResolver(affLibrary);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const detailRows: SalesDetailRecord[] = records.map((r) => ({
    id: r.id,
    orderDate: r.orderDate.toISOString().slice(0, 10),
    affiliatePlatform: r.affiliatePlatform,
    affiliateProgram: r.affiliateProgram,
    store: r.store,
    brand: r.brand,
    affiliateName: r.affiliateName,
    affiliateTypeLabel: resolveType(r.affiliateName, r.affiliateType),
    region: r.region,
    asin: r.asin,
    parentAsin: r.parentAsin,
    storeProductLabel: r.storeProductLabel,
    revenue: r.revenue,
    unitsSold: r.unitsSold,
    commission: r.commission,
    commissionRate: r.commissionRate,
    customerId: r.customerId,
  }));

  return (
    <>
      <BIFilters options={filterOptions} />
      <SalesDetailTable records={detailRows} customers={customers} total={total} filterParams={sp} />
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">共 {formatNumber(total)} 条</span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={buildPageUrl(sp, page - 1)}
                className="btn-secondary btn-sm"
              >
                上一页
              </Link>
            )}
            <span className="text-slate-500">
              {page} / {pages}
            </span>
            {page < pages && (
              <Link
                href={buildPageUrl(sp, page + 1)}
                className="btn-secondary btn-sm"
              >
                下一页
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function buildPageUrl(
  sp: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "page") params.set(k, v);
  }
  params.set("page", String(page));
  return `/bi?${params.toString()}`;
}

async function UploadTab() {
  const [batches, customers] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.salesBatch.findMany as any)({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        uploader: { select: { name: true } },
        customer: { select: { brandName: true } },
      },
      take: 30,
    }) as Promise<UploadBatchRow[]>,
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { brandName: "asc" },
      select: { id: true, brandName: true },
    }),
  ]);
  return (
    <UploadPanel
      batches={batches.map((b) => ({
        id: b.id,
        fileName: b.fileName,
        recordCount: b.recordCount,
        platform: b.affiliatePlatform,
        customerName: b.customer?.brandName ?? null,
        uploaderName: b.uploader.name,
        createdAt: b.createdAt.toISOString(),
      }))}
      customers={customers}
    />
  );
}

async function CleanupTab({
  filterOptions,
  where,
  sp,
}: {
  filterOptions: FilterOptions;
  where: Prisma.SalesRecordWhereInput;
  sp: Record<string, string | undefined>;
}) {
  const [totalCount, previewRows] = await Promise.all([
    prisma.salesRecord.count({ where }),
    prisma.salesRecord.findMany({
      where,
      orderBy: { orderDate: "desc" },
      take: 50,
      select: {
        id: true,
        orderDate: true,
        brand: true,
        affiliatePlatform: true,
        affiliateName: true,
        store: true,
        region: true,
        revenue: true,
      },
    }),
  ]);

  // Serialize current URL-based filter to the format /api/sales/clear expects
  const filterJson = JSON.stringify({
    platforms: csvFilterValues(sp, "platforms"),
    programs: csvFilterValues(sp, "programs"),
    brands: csvFilterValues(sp, "brands"),
    regions: csvFilterValues(sp, "regions"),
    stores: csvFilterValues(sp, "stores"),
    affiliateNames: csvFilterValues(sp, "affiliateNames"),
    affiliateTypes: csvFilterValues(sp, "types"),
    asins: csvFilterValues(sp, "asins"),
    from: sp.from ?? "",
    to: sp.to ?? "",
  });

  return (
    <>
      <BIFilters options={filterOptions} />
      <CleanupPanel
        totalCount={totalCount}
        previewRows={previewRows.map((r) => ({
          ...r,
          orderDate: r.orderDate.toISOString(),
        }))}
        filterJson={filterJson}
      />
    </>
  );
}

async function AsinTab() {
  const [mappings, total] = await Promise.all([
    prisma.asinMapping.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.asinMapping.count(),
  ]);
  return (
    <AsinMappingPanel
      total={total}
      mappings={mappings.map((m) => ({
        ...m,
        createdAt: formatDateTime(m.createdAt),
      }))}
    />
  );
}

