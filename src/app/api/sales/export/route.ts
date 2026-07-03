import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { buildSheet } from "@/lib/excel";
import { SALES_FIELDS } from "@/lib/salesFields";
import { formatDate } from "@/lib/utils";

// GET /api/sales/export with same query params as the BI page filters.
// Exports the filtered records as an xlsx with all 37 system fields.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const url = new URL(req.url);
  const csv = (k: string) =>
    (url.searchParams.get(k) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const where: Prisma.SalesRecordWhereInput = { deletedAt: null };
  const platforms = csv("platforms");
  if (platforms.length) where.affiliatePlatform = { in: platforms };
  const programs = csv("programs");
  if (programs.length) where.affiliateProgram = { in: programs };
  const brands = csv("brands");
  if (brands.length) where.brand = { in: brands };
  const regions = csv("regions");
  if (regions.length) where.region = { in: regions };
  const stores = csv("stores");
  if (stores.length) where.store = { in: stores };
  const affiliateNames = csv("affiliateNames");
  if (affiliateNames.length) where.affiliateName = { in: affiliateNames };
  const types = csv("types");
  if (types.length) where.affiliateType = { in: types };

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from || to) {
    where.orderDate = {};
    if (from) where.orderDate.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.orderDate.lte = end;
    }
  }

  const records = await prisma.salesRecord.findMany({
    where,
    orderBy: { orderDate: "desc" },
    take: 50000,
  });

  const rows = records.map((r) => {
    const row: Record<string, string | number> = {};
    for (const f of SALES_FIELDS) {
      // @ts-expect-error dynamic access against Prisma row
      const v = r[f.key];
      let cell: string | number = "";
      if (v == null) cell = "";
      else if (f.type === "date" && v instanceof Date) cell = formatDate(v);
      else if (f.type === "percent" && typeof v === "number")
        cell = `${(v * 100).toFixed(2)}%`;
      else if (typeof v === "number") cell = v;
      else cell = String(v);
      row[f.label] = cell;
    }
    return row;
  });

  const buffer = buildSheet(rows, "推广销售数据");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sales-${Date.now()}.xlsx"`,
    },
  });
}
