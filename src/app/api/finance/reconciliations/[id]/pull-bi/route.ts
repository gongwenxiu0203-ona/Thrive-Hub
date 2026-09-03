import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { calcBetAndCommission, recalcReconciliation } from "@/lib/reconciliationCalc";
import { reconciliationSalesRecordWhere } from "@/lib/activeSalesScope";
import { errorResponse } from "@/lib/appError";
import { readReconciliationConfirmation } from "@/lib/reconciliationConfirmation";

const REGION_ALIASES: Array<{ matches: string[]; regions: string[] }> = [
  { matches: ["美国", "美國", "us", "usa", "united states", "united states of america"], regions: ["US", "USA", "United States", "United States of America", "美国", "美國"] },
  { matches: ["加拿大", "ca", "canada"], regions: ["CA", "Canada", "加拿大"] },
  { matches: ["英国", "英國", "uk", "gb", "great britain", "united kingdom"], regions: ["UK", "GB", "Great Britain", "United Kingdom", "英国", "英國"] },
  { matches: ["德国", "德國", "de", "germany"], regions: ["DE", "Germany", "德国", "德國"] },
  { matches: ["法国", "法國", "fr", "france"], regions: ["FR", "France", "法国", "法國"] },
  { matches: ["意大利", "义大利", "義大利", "it", "italy"], regions: ["IT", "Italy", "意大利", "义大利", "義大利"] },
  { matches: ["西班牙", "es", "spain"], regions: ["ES", "Spain", "西班牙"] },
  { matches: ["澳大利亚", "澳大利亞", "澳洲", "au", "australia"], regions: ["AU", "Australia", "澳大利亚", "澳大利亞", "澳洲"] },
  { matches: ["日本", "jp", "japan"], regions: ["JP", "Japan", "日本"] },
  { matches: ["中国香港", "中國香港", "香港", "hk", "hong kong"], regions: ["HK", "Hong Kong", "香港", "中国香港", "中國香港"] },
  { matches: ["中国", "中國", "cn", "china"], regions: ["CN", "China", "中国", "中國"] },
];

function salesRegionsForCountries(countries: string[]) {
  const regions = new Set<string>();
  for (const country of countries) {
    const value = country.trim();
    if (!value) continue;
    const normalized = value.toLocaleLowerCase("en-US");
    const mapped = REGION_ALIASES.find(({ matches }) => matches.some(match => {
      if (normalized === match) return true;
      if (match.length <= 2 && /^[a-z]+$/.test(match)) {
        return new RegExp(`(^|[^a-z])${match}([^a-z]|$)`, "i").test(normalized);
      }
      return normalized.includes(match);
    }));
    if (mapped) mapped.regions.forEach(region => regions.add(region));
    else regions.add(value);
  }
  return [...regions];
}

// POST /api/finance/reconciliations/[id]/pull-bi
// 根据对账周期从 SalesRecord 自动拉取该客户的销售单量和销售额
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "EDIT", req);
    const { id } = await params;

    const rec = await prisma.customerReconciliation.findFirst({ where: scopedReconciliationWhere(id, access.scope) });
    if (!rec) return NextResponse.json({ error: "对账记录不存在或您无权访问" }, { status: 404 });
    if (rec.status !== "DRAFT") {
      return NextResponse.json({ error: "只有草稿状态可以重新拉取 BI 数据" }, { status: 400 });
    }
    if (rec.reconcileType === "FEE_ONLY") {
      return NextResponse.json({ error: "固费对账不关联销售数据，无需拉取 BI；请在销售佣金对账中执行此操作" }, { status: 400 });
    }
    const confirmation = readReconciliationConfirmation(rec);
    if (rec.projectConfirmationId) {
      if (!confirmation?.commission) return NextResponse.json({ error: "项目确认书佣金快照无效" }, { status: 400 });
      if (["CAMPAIGN", "PUBLISHER"].includes(confirmation.commission.basis)) {
        return NextResponse.json({ error: "该确认书按 Campaign 或联盟伙伴计佣，必须先核定订单归属，不能直接使用客户 BI 总额" }, { status: 400 });
      }
      const overlapping = await prisma.customerReconciliation.findMany({ where: {
        id: { not: rec.id }, customerId: rec.customerId, deletedAt: null,
        projectConfirmationId: { not: null }, reconcileType: { in: ["COMMISSION_ONLY", "BOTH"] },
        planStatus: { not: "CANCELLED" }, periodStart: { lte: rec.periodEnd }, periodEnd: { gte: rec.periodStart },
      }, select: { ruleSnapshot: true, projectConfirmationId: true } });
      const currentRegions = new Set(salesRegionsForCountries(confirmation.scopes.map(scope => scope.country)));
      const hasAmbiguousOverlap = overlapping.some((other) => {
        const otherConfirmation = readReconciliationConfirmation(other);
        if (!otherConfirmation) return true;
        const otherRegions = salesRegionsForCountries(otherConfirmation.scopes.map(scope => scope.country));
        if (!currentRegions.size || !otherRegions.length) return true;
        return otherRegions.some(region => currentRegions.has(region));
      });
      if (hasAmbiguousOverlap) return NextResponse.json({ error: "同一客户本期的多份计佣确认书包含重复或无法识别的站点，请先完成订单唯一归属后再核定销售额" }, { status: 409 });
    }

    // 聚合该客户在对账周期内的销售数据
    const salesRegions = salesRegionsForCountries(confirmation?.scopes.map(scope => scope.country) ?? []);
    const salesRecordWhere = reconciliationSalesRecordWhere({
        customerId: rec.customerId,
        periodStart: rec.periodStart,
        periodEnd: rec.periodEnd,
      });
    const agg = await prisma.salesRecord.aggregate({
      where: salesRegions.length > 0
        ? { AND: [salesRecordWhere, { region: { in: salesRegions } }] }
        : salesRecordWhere,
      _sum: {
        orders: true,
        revenue: true,
      },
    });

    const actualOrders = agg._sum.orders ?? 0;
    const actualSalesAmount = agg._sum.revenue ?? 0;

    const calc = rec.projectConfirmationId
      ? confirmation?.commission?.mode === "PACKAGE" && rec.confirmedCommissionRate == null
        ? { betResult: "NA", actualCommissionRate: 0, commissionAmount: 0 }
        : await recalcReconciliation(rec.id, { actualSalesAmount })
      : calcBetAndCommission({
          betType: rec.betType,
          betOrderCount: rec.betOrderCount,
          betSalesAmount: rec.betSalesAmount,
          actualOrders,
          actualSalesAmount,
          commissionRate: rec.commissionRate,
        });

    const updated = await prisma.customerReconciliation.update({
      where: { id },
      data: {
        actualOrders,
        actualSalesAmount,
        ...calc,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      ...updated,
      biScope: salesRegions.length > 0
        ? {
            countries: [...new Set(confirmation?.scopes.map(scope => scope.country.trim()).filter(Boolean) ?? [])],
            regions: salesRegions,
          }
        : null,
    });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.reconciliation.pull-bi");
  }
}
