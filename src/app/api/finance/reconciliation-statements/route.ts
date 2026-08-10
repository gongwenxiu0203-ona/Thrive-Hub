import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getReconciliationAccess } from "@/lib/reconciliationAccess";
import { FeaturePermissionError, requireFeaturePermission } from "@/lib/permissionGuard";
import {
  generateReconciliationStatementPdf,
  reconciliationStatementFilename,
  type ReconciliationBiSection,
  type ReconciliationStatementData,
  type ReconciliationStatementRow,
} from "@/lib/reconciliationStatementPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STATEMENT_RECORDS = 100;

function statementNumber(customerId: string, generatedAt: Date): string {
  const date = generatedAt.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = customerId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "CLIENT";
  return `ROR-${date}-${suffix}`;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "登录已失效，请重新登录后生成对账明细" }, { status: 401 });
  }

  try {
    const access = await getReconciliationAccess(session, "READ", request);
    const body: unknown = await request.json().catch(() => null);
    const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const ids = Array.isArray(source.reconciliationIds)
      ? [...new Set(source.reconciliationIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        ).map((id) => id.trim()))]
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "请至少选择一条固费或销售佣金对账记录" }, { status: 400 });
    }
    if (ids.length > MAX_STATEMENT_RECORDS) {
      return NextResponse.json(
        { error: `单次最多生成 ${MAX_STATEMENT_RECORDS} 条对账记录，请减少选择后重试` },
        { status: 400 },
      );
    }

    const records = await prisma.customerReconciliation.findMany({
      where: { AND: [{ id: { in: ids }, deletedAt: null }, access.scope] },
      include: {
        customer: { select: { id: true, brandName: true } },
        contract: { select: { contractNo: true } },
      },
      orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
    });
    if (records.length !== ids.length) {
      return NextResponse.json(
        { error: "部分对账记录不存在、已删除或不在您的数据访问范围内" },
        { status: 404 },
      );
    }
    if (new Set(records.map((record) => record.customerId)).size !== 1) {
      return NextResponse.json(
        { error: "一份对账明细只能包含同一客户的记录，请按客户分别生成" },
        { status: 400 },
      );
    }

    const commissionRecords = records.filter(
      (record) => record.reconcileType === "COMMISSION_ONLY" || record.reconcileType === "BOTH",
    );
    if (commissionRecords.length > 0) {
      await requireFeaturePermission(session, "bi.view", "READ");
    }

    const biSections: ReconciliationBiSection[] = await Promise.all(
      commissionRecords.map(async (record) => {
        const details = await prisma.salesRecord.findMany({
          where: {
            customerId: record.customerId,
            deletedAt: null,
            orderDate: { gte: record.periodStart, lte: record.periodEnd },
          },
          select: {
            id: true,
            orderDate: true,
            affiliatePlatform: true,
            affiliateName: true,
            internalAffiliateName: true,
            asin: true,
            parentAsin: true,
            storeProductLabel: true,
            orders: true,
            unitsSold: true,
            revenue: true,
          },
          orderBy: [
            { orderDate: "asc" },
            { affiliatePlatform: "asc" },
            { affiliateName: "asc" },
            { id: "asc" },
          ],
        });
        const currentBiSalesAmount = details.reduce((sum, detail) => sum + detail.revenue, 0);
        const lockedSalesAmount = record.finalSalesAmount ?? record.actualSalesAmount;
        return {
          reconciliationId: record.id,
          periodStart: record.periodStart,
          periodEnd: record.periodEnd,
          currency: record.commissionCurrency,
          lockedSalesAmount,
          currentBiSalesAmount,
          difference: currentBiSalesAmount - lockedSalesAmount,
          recordCount: details.length,
          orderCount: details.reduce((sum, detail) => sum + detail.orders, 0),
          unitsSold: details.reduce((sum, detail) => sum + detail.unitsSold, 0),
          details,
        };
      }),
    );

    const rows: ReconciliationStatementRow[] = records.flatMap((record) => {
      const common = {
        id: record.id,
        createdAt: record.createdAt,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        contractNo: record.contract.contractNo,
      };
      const result: ReconciliationStatementRow[] = [];
      if (record.reconcileType === "FEE_ONLY" || record.reconcileType === "BOTH") {
        result.push({
          ...common,
          stream: "FIXED_FEE",
          amount: record.feeAmount,
          currency: record.fixedFeeCurrency,
          actualSalesAmount: null,
          commissionRate: null,
        });
      }
      if (record.reconcileType === "COMMISSION_ONLY" || record.reconcileType === "BOTH") {
        result.push({
          ...common,
          stream: "SALES_COMMISSION",
          amount: record.finalCommissionAmount ?? record.commissionAmount,
          currency: record.commissionCurrency,
          actualSalesAmount: record.finalSalesAmount ?? record.actualSalesAmount,
          commissionRate: record.actualCommissionRate,
        });
      }
      return result;
    });
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "所选记录没有可生成的固费或销售佣金明细" },
        { status: 409 },
      );
    }

    const generatedAt = new Date();
    const statement: ReconciliationStatementData = {
      statementNo: statementNumber(records[0].customerId, generatedAt),
      customerName: records[0].customer.brandName,
      generatedAt,
      rows,
      biSections,
    };
    const pdf = await generateReconciliationStatementPdf(statement);
    const filename = reconciliationStatementFilename(statement);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reconciliation-operations-report.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FeaturePermissionError) {
      return NextResponse.json(
        { error: error.feature === "bi.view" ? "导出销售佣金 BI 明细需要推广数据 BI 的查看权限" : "您没有查看客户对账或生成对账明细的权限" },
        { status: 403 },
      );
    }
    console.error("[reconciliation-statement-pdf] generation failed", error);
    return NextResponse.json(
      { error: "对账明细 PDF 生成失败，请稍后重试" },
      { status: 500 },
    );
  }
}
