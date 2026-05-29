import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import AffiliatesClient from "./AffiliatesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "联盟资源库 · Thraive联盟营销系统" };

async function loadOptions() {
  const [affiliates, users, customers] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.affiliate.findMany as any)({
      select: {
        platformAffiliateName: true,
        source: true,
        category: true,
        affiliateType: true,
        tags: true,
        brand: true,
        developmentStatus: true,
        cooperationMode: true,
        personInChargeId: true,
        personInChargeName: true,
        personInCharge: { select: { name: true } },
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.customer.findMany({ select: { id: true, brandName: true }, orderBy: { brandName: "asc" } }),
  ]);

  const distinct = <T>(arr: (T | null | undefined)[]) =>
    [...new Set(arr.filter(Boolean))] as T[];

  const flatJson = (arr: (string | null | undefined)[]) => {
    const set = new Set<string>();
    for (const s of arr) {
      if (!s) continue;
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) parsed.forEach((v: string) => v && set.add(v));
      } catch { /* ignore */ }
    }
    return [...set].sort();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const affRows = affiliates as any[];
  const picNames = distinct([
    ...affRows.map((a) => a.personInCharge?.name ?? null),
    ...affRows.map((a) => a.personInChargeName ?? null),
  ]).sort();

  return {
    sources: distinct(affRows.map((a) => a.source)),
    categories: distinct(affRows.map((a) => a.category)),
    types: distinct(affRows.map((a) => a.affiliateType)),
    tags: flatJson(affRows.map((a) => a.tags)),
    brands: distinct(affRows.map((a) => a.brand)),
    statuses: distinct(affRows.map((a) => a.developmentStatus)),
    modes: flatJson(affRows.map((a) => a.cooperationMode)),
    names: distinct(affRows.map((a) => a.platformAffiliateName)).sort(),
    pics: picNames,
    users: users.map((u) => ({ id: u.id, name: u.name })),
    customers: customers.map((c) => ({ id: c.id, brandName: c.brandName })),
  };
}

async function loadDashboardData() {
  const affiliates = await prisma.affiliate.findMany({
    select: {
      source: true,
      category: true,
      affiliateType: true,
      tags: true,
      developmentStatus: true,
      insFollowers: true,
      youtubeFollowers: true,
      tiktokFollowers: true,
      fbFollowers: true,
      websiteTraffic: true,
      createdAt: true,
    },
  });

  const countBy = (fn: (a: (typeof affiliates)[0]) => string | null | undefined) => {
    const map: Record<string, number> = {};
    for (const a of affiliates) {
      const v = fn(a) ?? "未填写";
      map[v] = (map[v] ?? 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  };

  const flatJsonCount = (field: keyof (typeof affiliates)[0]) => {
    const map: Record<string, number> = {};
    for (const a of affiliates) {
      const s = a[field] as string | null;
      if (!s) continue;
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) arr.forEach((v: string) => { if (v) map[v] = (map[v] ?? 0) + 1; });
      } catch { /* ignore */ }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  };

  const now = new Date();
  const monthlyNew: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const count = affiliates.filter((a) => a.createdAt >= d && a.createdAt < next).length;
    monthlyNew.push({ month: label, count });
  }

  return {
    total: affiliates.length,
    bySource: countBy((a) => a.source),
    byCategory: countBy((a) => a.category),
    byType: countBy((a) => a.affiliateType),
    byStatus: countBy((a) => a.developmentStatus),
    byTag: flatJsonCount("tags"),
    totalFollowers: {
      Instagram: affiliates.reduce((s, a) => s + (a.insFollowers ?? 0), 0),
      YouTube: affiliates.reduce((s, a) => s + (a.youtubeFollowers ?? 0), 0),
      TikTok: affiliates.reduce((s, a) => s + (a.tiktokFollowers ?? 0), 0),
      Facebook: affiliates.reduce((s, a) => s + (a.fbFollowers ?? 0), 0),
      Website: affiliates.reduce((s, a) => s + (a.websiteTraffic ?? 0), 0),
    },
    monthlyNew,
  };
}

export default async function AffiliatePage() {
  const session = await requireSession();
  const [options, dashData] = await Promise.all([loadOptions(), loadDashboardData()]);

  return (
    <Suspense>
      <AffiliatesClient options={options} dashData={dashData} currentUserId={session.userId} />
    </Suspense>
  );
}
