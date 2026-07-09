import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { buildSheet } from "@/lib/excel";
import { SALES_FIELDS } from "@/lib/salesFields";
import { formatDate } from "@/lib/utils";
import {
  buildSalesRecordWhereFromParams,
  csvFilterValues,
  EMPTY_FILTER_VALUE,
  type SalesRecordFilterParams,
} from "@/lib/salesRecordFilters";

// GET /api/sales/export with same query params as the BI page filters.
// Exports the filtered records as an xlsx with all 37 system fields.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries()) as SalesRecordFilterParams;

  const where: Prisma.SalesRecordWhereInput = { deletedAt: null, batch: { deletedAt: null } };
  const types = csvFilterValues(sp, "types").filter((v) => v !== EMPTY_FILTER_VALUE);
  let typeAffNames: string[] | undefined;
  if (types.length) {
    const affLibrary = await prisma.affiliate.findMany({
      where: { affiliateType: { in: types } },
      select: { platformAffiliateName: true },
    });
    typeAffNames = affLibrary.map((a) => a.platformAffiliateName.trim()).filter(Boolean);
  }
  const userWhere = buildSalesRecordWhereFromParams(sp, typeAffNames);
  const finalWhere: Prisma.SalesRecordWhereInput = { AND: [where, userWhere] };

  const records = await prisma.salesRecord.findMany({
    where: finalWhere,
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
