import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import AffiliatesClient from "./AffiliatesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "联盟资源库 · Thraive联盟营销系统" };

async function loadOptions() {
  const [affiliates, users, customers, salesBrands] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.affiliate.findMany as any)({
      select: {
        platformAffiliateName: true,
        source: true,
        category: true,
        affiliateType: true,
        tags: true,
        brand: true,
        brandEntries: true,
        developmentStatus: true,
        cooperationMode: true,
        region: true,
        personInChargeId: true,
        personInChargeName: true,
        personInCharge: { select: { name: true } },
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.customer.findMany({ select: { id: true, brandName: true }, orderBy: { brandName: "asc" } }),
    // 往期合作数据里的品牌（销售记录 distinct brand）
    prisma.salesRecord.findMany({ select: { brand: true }, distinct: ["brand"] }),
  ]);

  const distinct = <T,>(arr: (T | null | undefined)[]) =>
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
    ...affRows.map((a: any) => a.personInCharge?.name ?? null),
    ...affRows.map((a: any) => a.personInChargeName ?? null),
  ]).sort();

  return {
    sources: distinct(affRows.map((a: any) => a.source)),
    categories: distinct(affRows.map((a: any) => a.category)),
    types: distinct(affRows.map((a: any) => a.affiliateType)),
    tags: flatJson(affRows.map((a: any) => a.tags)),
    // 品牌：联盟商自身 brand + 多品牌记录(brandEntries) + 往期合作数据(销售记录) 的品牌并集
    brands: distinct([
      ...affRows.map((a: any) => a.brand),
      ...affRows.flatMap((a: any) => {
        try { return (JSON.parse(a.brandEntries ?? "[]") as { brandName?: string }[]).map((e) => e.brandName ?? null); }
        catch { return []; }
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(salesBrands as any[]).map((s) => s.brand),
    ]).sort(),
    statuses: distinct(affRows.map((a: any) => a.developmentStatus)),
    modes: flatJson(affRows.map((a: any) => a.cooperationMode)),
    regions: distinct(affRows.map((a: any) => a.region)).sort(),
    names: distinct(affRows.map((a: any) => a.platformAffiliateName)).sort(),
    pics: picNames,
    users: users.map((u) => ({ id: u.id, name: u.name })),
    customers: customers.map((c) => ({ id: c.id, brandName: c.brandName })),
  };
}

export default async function AffiliatePage() {
  const session = await requireSession();
  const options = await loadOptions();

  return (
    <Suspense>
      <AffiliatesClient options={options} currentUserId={session.userId} />
    </Suspense>
  );
}
