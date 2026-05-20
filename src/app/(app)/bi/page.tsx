import Link from "next/link";
import { DollarSign, Percent, Package, Download } from "lucide-react";
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
import { formatCurrencyWith, formatCurrency, getCurrencyCode, formatNumber, formatDateTime, cn } from "@/lib/utils";
import { requireSession } from "@/lib/session";

export const metadata = { title: "推广数据BI · 联盟营销管理系统" };

const ALL_TABS = [
  { key: "dashboard", label: "销售看板" },
  { key: "detail", label: "明细数据" },
  { key: "upload", label: "数据上传" },
  { key: "cleanup", label: "数据清理" },
  { key: "asin", label: "ASIN 匹配" },
];

// Roles treated as full-access staff
function isStaff(role: string) {
  return role === "ADMIN" || role === "USER" || role === "LYNQ_STAFF";
}

const PAGE_SIZE = 50;

function csv(sp: Record<string, string | undefined>, key: string): string[] {
  return (sp[key] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildWhere(
  sp: Record<string, string | undefined>,
): Prisma.SalesRecordWhereInput {
  const where: Prisma.SalesRecordWhereInput = {};
  const platforms = csv(sp, "platforms");
  if (platforms.length) where.affiliatePlatform = { in: platforms };
  const programs = csv(sp, "programs");
  if (programs.length) where.affiliateProgram = { in: programs };
  const brands = csv(sp, "brands");
  if (brands.length) where.brand = { in: brands };
  const regions = csv(sp, "regions");
  if (regions.length) where.region = { in: regions };
  const stores = csv(sp, "stores");
  if (stores.length) where.store = { in: stores };
  const aff = csv(sp, "affiliateNames");
  if (aff.length) where.affiliateName = { in: aff };
  const types = csv(sp, "types");
  if (types.length) where.affiliateType = { in: types };
  const asins = csv(sp, "asins");
  if (asins.length) where.asin = { in: asins };
  const parents = csv(sp, "parentAsins");
  if (parents.length) where.parentAsin = { in: parents };
  const labels = csv(sp, "labels");
  if (labels.length) where.storeProductLabel = { in: labels };
  if (sp.from || sp.to) {
    where.orderDate = {};
    if (sp.from) where.orderDate.gte = new Date(sp.from);
    if (sp.to) {
      const end = new Date(sp.to);
      end.setHours(23, 59, 59, 999);
      where.orderDate.lte = end;
    }
  }
  return where;
}

function exportQueryString(
  sp: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const k of [
    "platforms",
    "programs",
    "brands",
    "regions",
    "stores",
    "affiliateNames",
    "types",
    "from",
    "to",
  ]) {
    if (sp[k]) params.set(k, sp[k]!);
  }
  return params.toString();
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

  // Determine accessible tabs
  const TABS = isStaff(role)
    ? ALL_TABS
    : ALL_TABS.filter((t) => t.key === "dashboard");

  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "dashboard";

  // Build base where clause — restrict by role
  const baseWhere: Prisma.SalesRecordWhereInput = {};
  if (role === "BRAND" && brandName) {
    baseWhere.brand = brandName;
  }
  if (role === "CHANNEL") {
    // Get customer IDs for this channel user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelCustomers = await (prisma.customer.findMany as any)({
      where: {
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

  // Merge user filters with base role-based where
  const userWhere = buildWhere(sp);
  const where: Prisma.SalesRecordWhereInput = {
    AND: [baseWhere, userWhere],
  };

  // Distinct values for filter dropdowns
  const allDistinct = await prisma.salesRecord.findMany({
    where: baseWhere,
    select: {
      affiliatePlatform: true,
      affiliateProgram: true,
      brand: true,
      region: true,
      store: true,
      affiliateName: true,
      affiliateType: true,
      asin: true,
      parentAsin: true,
      storeProductLabel: true,
    },
  });
  const uniq = (xs: (string | null)[]) =>
    [...new Set(xs.filter((x): x is string => !!x && x.trim() !== ""))].sort();
  const filterOptions: FilterOptions = {
    platforms: uniq(allDistinct.map((r) => r.affiliatePlatform)),
    programs: uniq(allDistinct.map((r) => r.affiliateProgram)),
    brands: uniq(allDistinct.map((r) => r.brand)),
    regions: uniq(allDistinct.map((r) => r.region)),
    stores: uniq(allDistinct.map((r) => r.store)),
    affiliateNames: uniq(allDistinct.map((r) => r.affiliateName)),
    types: uniq(allDistinct.map((r) => r.affiliateType)),
    asins: uniq(allDistinct.map((r) => r.asin)),
    parentAsins: uniq(allDistinct.map((r) => r.parentAsin)),
    labels: uniq(allDistinct.map((r) => r.storeProductLabel)),
  };

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
              href={`/api/sales/export?${exportQueryString(sp)}`}
              className="btn-secondary"
            >
              <Download className="h-4 w-4" /> 导出当前筛选
            </a>
          )
        }
      />

      <div className="flex gap-1 border-b border-slate-200">
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
              className={cn(
                "rounded-t-lg px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-b-2 border-brand-600 text-brand-700"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "dashboard" && (
        <DashboardTab
          filterOptions={filterOptions}
          where={where}
          isChannel={isChannel}
          isBrand={isBrand}
          regions={csv(sp, "regions")}
        />
      )}
      {tab === "detail" && isStaff(role) && (
        <DetailTab filterOptions={filterOptions} where={where} sp={sp} />
      )}
      {tab === "upload" && isStaff(role) && <UploadTab />}
      {tab === "cleanup" && isStaff(role) && (
        <CleanupTab filterOptions={filterOptions} where={where} sp={sp} />
      )}
      {tab === "asin" && isStaff(role) && <AsinTab />}
    </div>
  );
}

async function DashboardTab({
  filterOptions,
  where,
  isChannel = false,
  isBrand = false,
  regions = [],
}: {
  filterOptions: FilterOptions;
  where: Prisma.SalesRecordWhereInput;
  isChannel?: boolean;
  isBrand?: boolean;
  regions?: string[];
}) {
  const records = await prisma.salesRecord.findMany({
    where,
    orderBy: { orderDate: "asc" },
  });

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
  const typeDist = group((r) => r.affiliateType ?? "未分类");
  const brandBars = group((r) => r.brand).slice(0, 12);

  // Commission rate distribution: bucket by percentage rounded to step 0.05
  const rateCounts = new Map<string, number>();
  for (const r of records) {
    const pct = Math.round(r.commissionRate * 20) / 20; // 0.05 step
    const key = pct.toFixed(2);
    rateCounts.set(key, (rateCounts.get(key) ?? 0) + 1);
  }
  const commissionRateDist = [...rateCounts.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
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
      type: r.affiliateType ?? "",
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
    .slice(0, 50)
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
    .slice(0, 50)
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

  return (
    <>
      <BIFilters options={channelFilterOptions} isChannel={isChannel} />

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="总销售额"
          value={fmtCurrency(totalRevenue)}
          icon={<DollarSign className="h-5 w-5" />}
          accent="text-brand-600"
        />
        <StatCard
          label="联盟商佣金"
          value={fmtCurrency(totalCommission)}
          icon={<Percent className="h-5 w-5" />}
          accent="text-emerald-600"
        />
        <StatCard
          label="销售数量"
          value={formatNumber(totalUnits)}
          icon={<Package className="h-5 w-5" />}
          accent="text-amber-600"
        />
      </div>

      <SalesDashboard
        programDist={programDist}
        platformDist={platformDist}
        typeDist={typeDist}
        commissionRateDist={commissionRateDist}
        brandBars={brandBars}
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
      />
    </>
  );
}

async function DetailTab({
  filterOptions,
  where,
  sp,
}: {
  filterOptions: FilterOptions;
  where: Prisma.SalesRecordWhereInput;
  sp: Record<string, string | undefined>;
}) {
  const page = Math.max(1, Number(sp.page) || 1);
  const [records, total] = await Promise.all([
    prisma.salesRecord.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.salesRecord.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <BIFilters options={filterOptions} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data w-full text-xs">
            <thead>
              <tr>
                <th>订单日期</th>
                <th>联盟平台</th>
                <th>联盟类型</th>
                <th>店铺</th>
                <th>品牌</th>
                <th>联盟商</th>
                <th>类型</th>
                <th>地区</th>
                <th>ASIN</th>
                <th>Parent</th>
                <th>链接标签</th>
                <th className="text-right">销售金额</th>
                <th className="text-right">销售数量</th>
                <th className="text-right">佣金</th>
                <th className="text-right">佣金率</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-8 text-center text-slate-400">
                    无符合条件的数据
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id}>
                    <td>{r.orderDate.toISOString().slice(0, 10)}</td>
                    <td>{r.affiliatePlatform}</td>
                    <td>{r.affiliateProgram ?? "—"}</td>
                    <td>{r.store ?? "—"}</td>
                    <td>{r.brand}</td>
                    <td>{r.affiliateName}</td>
                    <td>{r.affiliateType ?? "—"}</td>
                    <td>{r.region ?? "—"}</td>
                    <td>{r.asin ?? "—"}</td>
                    <td>{r.parentAsin ?? "—"}</td>
                    <td>{r.storeProductLabel ?? "—"}</td>
                    <td className="text-right">
                      {formatCurrency(r.revenue)}
                    </td>
                    <td className="text-right">{r.unitsSold}</td>
                    <td className="text-right">
                      {formatCurrency(r.commission)}
                    </td>
                    <td className="text-right">
                      {(r.commissionRate * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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
    prisma.salesBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        uploader: { select: { name: true } },
        customer: { select: { brandName: true } },
      },
      take: 30,
    }),
    prisma.customer.findMany({
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
    platforms: csv(sp, "platforms"),
    programs: csv(sp, "programs"),
    brands: csv(sp, "brands"),
    regions: csv(sp, "regions"),
    stores: csv(sp, "stores"),
    affiliateNames: csv(sp, "affiliateNames"),
    affiliateTypes: csv(sp, "types"),
    asins: csv(sp, "asins"),
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
