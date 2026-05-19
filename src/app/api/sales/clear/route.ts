import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// Clear sales records by filter. No row-count limit.
// Body: { filter: { platforms?, programs?, brands?, regions?, stores?,
//                   affiliateNames?, affiliateTypes?, asins?,
//                   from?, to?, customerId? }, dryRun?: boolean }
//
// dryRun=true → returns count only.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "仅管理员可执行数据清理" },
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
  const where: Prisma.SalesRecordWhereInput = {};
  if (f.platforms?.length)
    where.affiliatePlatform = { in: f.platforms };
  if (f.programs?.length) where.affiliateProgram = { in: f.programs };
  if (f.brands?.length) where.brand = { in: f.brands };
  if (f.regions?.length) where.region = { in: f.regions };
  if (f.stores?.length) where.store = { in: f.stores };
  if (f.affiliateNames?.length)
    where.affiliateName = { in: f.affiliateNames };
  if (f.affiliateTypes?.length)
    where.affiliateType = { in: f.affiliateTypes };
  if (f.asins?.length) where.asin = { in: f.asins };
  if (f.customerId) where.customerId = f.customerId;
  if (f.from || f.to) {
    where.orderDate = {};
    if (f.from) where.orderDate.gte = new Date(f.from);
    if (f.to) {
      const end = new Date(f.to);
      end.setHours(23, 59, 59, 999);
      where.orderDate.lte = end;
    }
  }

  // Require at least one filter to prevent accidental全表删除.
  if (Object.keys(where).length === 0) {
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

  const result = await prisma.salesRecord.deleteMany({ where });
  return NextResponse.json({ deleted: result.count });
}
