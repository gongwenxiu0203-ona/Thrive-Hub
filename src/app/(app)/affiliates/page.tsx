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
        region: true,
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
    ...affRows.map((a: any) => a.personInCharge?.name ?? null),
    ...affRows.map((a: any) => a.personInChargeName ?? null),
  ]).sort();

  return {
    sources: distinct(affRows.map((a: any) => a.source)),
    categories: distinct(affRows.map((a: any) => a.category)),
    types: distinct(affRows.map((a: any) => a.affiliateType)),
    tags: flatJson(affRows.map((a: any) => a.tags)),
    brands: distinct(affRows.map((a: any) => a.brand)),
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
