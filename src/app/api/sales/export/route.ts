import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { buildSheet } from "@/lib/excel";
import { SALES_FIELDS } from "@/lib/salesFields";
import { formatDate } from "@/lib/utils";
import { hasBiPermission } from "@/lib/biAuthorization";
import { salesScope } from "@/lib/dataScope";
import { resolveSafeViewScope } from "@/lib/permissionGuard";
import {
  buildSalesRecordWhereFromParams,
  csvFilterValues,
  EMPTY_FILTER_VALUE,
  type SalesRecordFilterParams,
} from "@/lib/salesRecordFilters";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await hasBiPermission(session.userId, "READ"))) {
    return NextResponse.json({ error: "无权导出 BI 数据" }, { status: 403 });
  }

  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries()) as SalesRecordFilterParams;
  const view = await resolveSafeViewScope(session, "bi", sp.scope);
  const base: Prisma.SalesRecordWhereInput = { deletedAt: null, batch: { deletedAt: null } };
  const types = csvFilterValues(sp, "types").filter((value) => value !== EMPTY_FILTER_VALUE);
  let typeAffiliateNames: string[] | undefined;
  if (types.length) {
    const affiliates = await prisma.affiliate.findMany({
      where: { affiliateType: { in: types }, deletedAt: null },
      select: { platformAffiliateName: true },
    });
    typeAffiliateNames = affiliates.map((item) => item.platformAffiliateName.trim()).filter(Boolean);
  }

  const where: Prisma.SalesRecordWhereInput = {
    AND: [
      base,
      salesScope(session, view),
      buildSalesRecordWhereFromParams(sp, typeAffiliateNames),
    ],
  };
  const records = await prisma.salesRecord.findMany({
    where,
    orderBy: { orderDate: "desc" },
    take: 50000,
  });

  const rows = records.map((record) => {
    const row: Record<string, string | number> = {};
    for (const field of SALES_FIELDS) {
      // @ts-expect-error Dynamic field access against a Prisma row.
      const value = record[field.key];
      let cell: string | number = "";
      if (value == null) cell = "";
      else if (field.type === "date" && value instanceof Date) cell = formatDate(value);
      else if (field.type === "percent" && typeof value === "number") cell = `${(value * 100).toFixed(2)}%`;
      else if (typeof value === "number") cell = value;
      else cell = String(value);
      row[field.label] = cell;
    }
    return row;
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: session.userId,
      action: "EXPORT",
      module: "BI",
      targetType: "SalesRecord",
      summary: `导出 BI 销售数据 ${records.length} 条`,
      metadataJson: JSON.stringify({ filters: sp, exportedCount: records.length }),
    },
  });

  const buffer = buildSheet(rows, "推广销售数据");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sales-${Date.now()}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
