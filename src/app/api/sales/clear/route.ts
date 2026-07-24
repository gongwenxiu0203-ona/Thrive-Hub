import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import {
  clearFilterFingerprint,
  consumeClearConfirmation,
  hasBiPermission,
  issueClearConfirmation,
} from "@/lib/biAuthorization";
import { salesScope } from "@/lib/dataScope";
import {
  buildSalesRecordWhereFromParams,
  csvFilterValues,
  EMPTY_FILTER_VALUE,
  type SalesRecordFilterParams,
} from "@/lib/salesRecordFilters";

type ClearFilter = {
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

function normalizedFilter(filter: ClearFilter) {
  return {
    ...filter,
    platforms: [...(filter.platforms ?? [])].sort(),
    programs: [...(filter.programs ?? [])].sort(),
    brands: [...(filter.brands ?? [])].sort(),
    regions: [...(filter.regions ?? [])].sort(),
    stores: [...(filter.stores ?? [])].sort(),
    affiliateNames: [...(filter.affiliateNames ?? [])].sort(),
    affiliateTypes: [...(filter.affiliateTypes ?? [])].sort(),
    asins: [...(filter.asins ?? [])].sort(),
  };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isStaff(session.role)) {
    return NextResponse.json({ error: "仅内部员工可执行数据清理" }, { status: 403 });
  }
  if (session.role !== "ADMIN" && !(await hasBiPermission(session.userId, "MANAGE"))) {
    return NextResponse.json({ error: "仅管理员或具有 BI 管理权限的内部员工可清理数据" }, { status: 403 });
  }

  let body: { filter?: ClearFilter; dryRun?: boolean; confirmationToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const filter = body.filter ?? {};
  const params: SalesRecordFilterParams = {
    platforms: filter.platforms?.join(","),
    programs: filter.programs?.join(","),
    brands: filter.brands?.join(","),
    regions: filter.regions?.join(","),
    stores: filter.stores?.join(","),
    affiliateNames: filter.affiliateNames?.join(","),
    types: filter.affiliateTypes?.join(","),
    asins: filter.asins?.join(","),
    from: filter.from,
    to: filter.to,
  };
  if (!Object.values(params).some(Boolean) && !filter.customerId) {
    return NextResponse.json({ error: "请至少指定一个筛选条件，避免清理全部数据" }, { status: 400 });
  }

  const types = csvFilterValues(params, "types").filter((value) => value !== EMPTY_FILTER_VALUE);
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
      { deletedAt: null, batch: { deletedAt: null } },
      buildSalesRecordWhereFromParams(params, typeAffiliateNames),
      ...(filter.customerId ? [{ customerId: filter.customerId }] : []),
      salesScope(session, session.role === "ADMIN" ? "all" : "mine"),
    ],
  };
  const count = await prisma.salesRecord.count({ where });
  const normalized = normalizedFilter(filter);
  const fingerprint = clearFilterFingerprint(normalized);

  if (body.dryRun === true) {
    const confirmation = issueClearConfirmation(session.userId, fingerprint, count);
    await prisma.adminAuditLog.create({
      data: {
        actorId: session.userId,
        action: "CLEAR_PREVIEW",
        module: "BI",
        targetType: "SalesRecord",
        summary: `预览清理 BI 销售数据 ${count} 条`,
        metadataJson: JSON.stringify({ filter: normalized, affectedCount: count, expiresAt: confirmation.expiresAt }),
      },
    });
    return NextResponse.json({ count, confirmationToken: confirmation.token, expiresAt: confirmation.expiresAt });
  }

  if (!body.confirmationToken || !consumeClearConfirmation(body.confirmationToken, session.userId, fingerprint, count)) {
    return NextResponse.json({ error: "确认令牌无效、已使用、已过期或影响数量已变化，请重新预览" }, { status: 409 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.salesRecord.updateMany({ where, data: { deletedAt: new Date() } });
    await tx.adminAuditLog.create({
      data: {
        actorId: session.userId,
        action: "CLEAR",
        module: "BI",
        targetType: "SalesRecord",
        summary: `清理 BI 销售数据 ${updated.count} 条`,
        beforeJson: JSON.stringify({ deletedAt: null, count }),
        afterJson: JSON.stringify({ softDeleted: true, count: updated.count }),
        metadataJson: JSON.stringify({ filter: normalized, affectedCount: updated.count }),
      },
    });
    return updated;
  });
  return NextResponse.json({ deleted: result.count });
}
