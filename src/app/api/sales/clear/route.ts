import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import {
  buildSalesRecordWhereFromParams,
  csvFilterValues,
  EMPTY_FILTER_VALUE,
  type SalesRecordFilterParams,
} from "@/lib/salesRecordFilters";

// Clear sales records by filter. No row-count limit.
// Body: { filter: { platforms?, programs?, brands?, regions?, stores?,
//                   affiliateNames?, affiliateTypes?, asins?,
//                   from?, to?, customerId? }, dryRun?: boolean }
//
// dryRun=true → returns count only.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isStaff(session.role)) {
    return NextResponse.json(
      { error: "仅内部员工可执行数据清理" },
      { status: 403 },
    );
  }

  let body: {
    filter?: {
      platforms?: string[];
      programs?: string[];
      brands?: string[];
      regions?: string[];
      stores?: string[];
      affiliateNames?: string[];
      affiliateTypes?: string[];
      asins?: string[];
      from?: string;
      to?: string;
      customerId?: string;
    };
    dryRun?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const f = body.filter ?? {};
  const filterParams: SalesRecordFilterParams = {
    platforms: f.platforms?.join(","),
    programs: f.programs?.join(","),
    brands: f.brands?.join(","),
    regions: f.regions?.join(","),
    stores: f.stores?.join(","),
    affiliateNames: f.affiliateNames?.join(","),
    types: f.affiliateTypes?.join(","),
    asins: f.asins?.join(","),
    from: f.from,
    to: f.to,
  };
  const hasUserFilter = Object.values(filterParams).some(Boolean) || !!f.customerId;

  const types = csvFilterValues(filterParams, "types").filter((v) => v !== EMPTY_FILTER_VALUE);
  let typeAffNames: string[] | undefined;
  if (types.length) {
    const affLibrary = await prisma.affiliate.findMany({
      where: { affiliateType: { in: types } },
      select: { platformAffiliateName: true },
    });
    typeAffNames = affLibrary.map((a) => a.platformAffiliateName.trim()).filter(Boolean);
  }
  const where: Prisma.SalesRecordWhereInput = {
    AND: [
      { deletedAt: null, batch: { deletedAt: null } },
      buildSalesRecordWhereFromParams(filterParams, typeAffNames),
      ...(f.customerId ? [{ customerId: f.customerId }] : []),
    ],
  };

  // Require at least one filter to prevent accidental全表删除.
  if (!hasUserFilter) {
    return NextResponse.json(
      {
        error: "请至少指定一个筛选条件，避免清理全部数据。",
      },
      { status: 400 },
    );
  }

  if (body.dryRun) {
    const count = await prisma.salesRecord.count({ where });
    return NextResponse.json({ count });
  }

  const result = await prisma.salesRecord.updateMany({
    where,
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ deleted: result.count });
}
