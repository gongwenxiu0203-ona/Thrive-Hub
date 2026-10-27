import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess, scopedReconciliationWhere } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { calcBetAndCommission, recalcReconciliation } from "@/lib/reconciliationCalc";
import { reconciliationSalesRecordWhere } from "@/lib/activeSalesScope";
import { errorResponse } from "@/lib/appError";
import { readReconciliationConfirmation } from "@/lib/reconciliationConfirmation";
import type { ContractConfirmationDraft } from "@/lib/contractConfirmationDraft";
import { buildBiSnapshot, readBiSnapshot, writeBiSnapshot } from "@/lib/reconciliationBiDetails";
import { findAmbiguousCommissionOverlap } from "@/lib/reconciliationCommissionOverlap";

function legacyDraft(rec: { customer: { brandName: string }; contract: { targetSite: string | null; promoPlatform: string | null }; legacyBillingUnit?: { scopeSnapshot: string } | null }): ContractConfirmationDraft {
  let source = rec.contract;
  if (rec.legacyBillingUnit) {
    try {
      const snapshot = JSON.parse(rec.legacyBillingUnit.scopeSnapshot) as { targetSite?: string | null; promoPlatform?: string | null };
      source = { targetSite: snapshot.targetSite ?? null, promoPlatform: snapshot.promoPlatform ?? null };
    } catch { source = { targetSite: null, promoPlatform: null }; }
  }
  const countries = String(source.targetSite ?? "").split(/[、,，;/]/).map((value) => value.trim()).filter(Boolean);
  const platforms = String(source.promoPlatform ?? "").split(/[、,，;/]/).map((value) => value.trim()).filter(Boolean);
  return {
    brand: rec.customer.brandName,
    scopes: countries.map((country) => ({ country, salesPlatforms: [], programs: platforms, thirdPartyPlatforms: [] })),
    productScope: "ALL",
    products: [],
  } as unknown as ContractConfirmationDraft;
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

    const rec = await prisma.customerReconciliation.findFirst({
      where: scopedReconciliationWhere(id, access.scope),
      include: {
        customer: { select: { brandName: true } },
        contract: { select: { targetSite: true, promoPlatform: true } },
        legacyBillingUnit: { select: { scopeSnapshot: true } },
      },
    });
    if (!rec) return NextResponse.json({ error: "对账记录不存在或您无权访问" }, { status: 404 });
    if (rec.status !== "DRAFT") {
      return NextResponse.json({ error: "只有草稿状态可以重新拉取 BI 数据" }, { status: 400 });
    }
    if (rec.reconcileType === "FEE_ONLY") {
      return NextResponse.json({ error: "固费对账不关联销售数据，无需拉取 BI；请在销售佣金对账中执行此操作" }, { status: 400 });
    }
    const confirmation = readReconciliationConfirmation(rec);
    const body = await req.json().catch(() => ({})) as { detailKey?: unknown };
    const detailKey = typeof body.detailKey === "string" && body.detailKey.trim() ? body.detailKey.trim() : null;
    if (rec.projectConfirmationId) {
      if (!confirmation?.commission) return NextResponse.json({ error: "项目确认书佣金快照无效" }, { status: 400 });
      if (["CAMPAIGN", "PUBLISHER"].includes(confirmation.commission.basis)) {
        return NextResponse.json({ error: "该确认书按 Campaign 或联盟伙伴计佣，必须先核定订单归属，不能直接使用客户 BI 总额" }, { status: 400 });
      }
    }
    const overlap = await findAmbiguousCommissionOverlap(rec);
    if (overlap) return NextResponse.json({ error: "同一客户本期的旧合同计费项目或项目确认书存在重叠计佣范围，请先核定订单唯一归属，不能对两项费用重复拉取同一销售额" }, { status: 409 });

    // 先限定客户和自然日周期，再严格按确认书的品牌、地区、联盟平台和商品范围筛选。
    const salesRecordWhere = reconciliationSalesRecordWhere({
        customerId: rec.customerId,
        periodStart: rec.periodStart,
        periodEnd: rec.periodEnd,
      });
    const salesRows = await prisma.salesRecord.findMany({
      where: salesRecordWhere,
      select: { brand: true, region: true, affiliatePlatform: true, asin: true, parentAsin: true, promotionLink: true, orders: true, revenue: true },
    });
    const draft = confirmation ?? legacyDraft(rec);
    if (!draft.brand.trim() || draft.scopes.length === 0) {
      return NextResponse.json({ error: "合同缺少品牌或地区推广范围，无法安全拉取 BI 数据，请先补全合同范围" }, { status: 400 });
    }
    const periodLabel = `${rec.periodStart.toISOString().slice(0, 10)} ~ ${rec.periodEnd.toISOString().slice(0, 10)}`;
    const previous = readBiSnapshot(rec.ruleSnapshot);
    const provisional = buildBiSnapshot({ rows: salesRows, draft, periodLabel, previous, detailKey, commissionAmount: 0 });
    const actualOrders = provisional.details.reduce((sum, line) => sum + line.orders, 0);
    const actualSalesAmount = provisional.details.reduce((sum, line) => sum + line.adjustedSalesAmount, 0);

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

    const snapshot = buildBiSnapshot({ rows: salesRows, draft, periodLabel, previous, detailKey, commissionAmount: calc.commissionAmount });
    const updated = await prisma.customerReconciliation.update({
      where: { id },
      data: {
        actualOrders,
        actualSalesAmount,
        ...calc,
        ruleSnapshot: writeBiSnapshot(rec.ruleSnapshot, snapshot),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      ...updated,
      biDetails: snapshot,
    });
  } catch (e) {
    if (e instanceof FeaturePermissionError) return NextResponse.json({ error: "无权限" }, { status: 403 });
    return errorResponse(e, "finance.reconciliation.pull-bi");
  }
}
