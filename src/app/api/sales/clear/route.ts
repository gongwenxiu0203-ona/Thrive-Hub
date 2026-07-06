import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { parseDateOnlyEnd, parseDateOnlyStart } from "@/lib/dateRange";

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
  const where: Prisma.SalesRecordWhereInput = { deletedAt: null, batch: { deletedAt: null } };
  let hasUserFilter = false;
  if (f.platforms?.length)
    where.affiliatePlatform = { in: f.platforms };
  if (f.platforms?.length) hasUserFilter = true;
  if (f.programs?.length) {
    where.affiliateProgram = { in: f.programs };
    hasUserFilter = true;
  }
  if (f.brands?.length) {
    where.brand = { in: f.brands };
    hasUserFilter = true;
  }
  if (f.regions?.length) {
    where.region = { in: f.regions };
    hasUserFilter = true;
  }
  if (f.stores?.length) {
    where.store = { in: f.stores };
    hasUserFilter = true;
  }
  if (f.affiliateNames?.length)
    where.affiliateName = { in: f.affiliateNames };
  if (f.affiliateNames?.length) hasUserFilter = true;
  if (f.affiliateTypes?.length) {
    where.affiliateType = { in: f.affiliateTypes };
    hasUserFilter = true;
  }
  if (f.asins?.length) {
    where.asin = { in: f.asins };
    hasUserFilter = true;
  }
  if (f.customerId) {
    where.customerId = f.customerId;
    hasUserFilter = true;
  }
  if (f.from || f.to) {
    hasUserFilter = true;
    where.orderDate = {};
    if (f.from) {
      const start = parseDateOnlyStart(f.from);
      if (start) where.orderDate.gte = start;
    }
    if (f.to) {
      const end = parseDateOnlyEnd(f.to);
      if (end) where.orderDate.lte = end;
    }
  }

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
