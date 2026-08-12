import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { parseDateOnlyUtc } from "@/lib/dateRange";
import { errorResponse } from "@/lib/appError";

// GET /api/finance/reconciliations — 获取对账列表
export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "READ", req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const reconciliations = await prisma.customerReconciliation.findMany({
      where: { AND: [{ deletedAt: null }, where, access.scope] },
      include: {
        customer: { select: { id: true, brandName: true, channelUserId: true } },
        contract: { select: { id: true, contractNo: true, type: true } },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        settlements: { select: { id: true, type: true, status: true, amount: true, estimatedDate: true, actualDate: true } },
        _count: { select: { reviews: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(reconciliations);
  } catch (e) {
    if (e instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "登录状态已失效，请重新登录后再操作" }, { status: 401 });
  }
}

// POST /api/finance/reconciliations — 新建对账记录
// 只需 customerId + contractId + periodStart + periodEnd
// 其余字段（金额、对赌、货币）自动从合同基本信息中拉取
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "EDIT", req);
    const body = await req.json();
    const {
      customerId,
      contractId,
      periodStart,
      periodEnd,
      reconcileType,
    } = body;

    if (!customerId || !contractId || !periodStart || !periodEnd) {
      return NextResponse.json({ error: "客户、合同、周期开始时间和结束时间均为必填项" }, { status: 400 });
    }

    const normalizedType = reconcileType ?? "BOTH";
    if (!NEW_RECONCILIATION_TYPES.includes(normalizedType)) {
      return NextResponse.json({ error: "新建对账必须分开选择固费或销售佣金，不再支持合并对账" }, { status: 400 });
    }
    const start = typeof periodStart === "string" ? parseDateOnlyUtc(periodStart) : null;
    const end = typeof periodEnd === "string" ? parseDateOnlyUtc(periodEnd) : null;
    if (!start || !end) {
      return NextResponse.json({ error: "对账周期日期格式无效" }, { status: 400 });
    }
    if (start > end) {
      return NextResponse.json({ error: "对账周期结束时间不能早于开始时间" }, { status: 400 });
    }

    // 获取合同信息，快照到对账记录
    const contract = await prisma.contract.findFirst({
      where: {
        id: contractId,
        customerId,
        deletedAt: null,
        customer: { ...access.customerScope, deletedAt: null },
      },
    });
    if (!contract) {
      return NextResponse.json({ error: "合同不存在" }, { status: 404 });
    }
    if (contract.status !== "COMPLETED") {
      return NextResponse.json({ error: "只能对已签署完成的合同创建对账" }, { status: 400 });
    }

    const conflictingTypes = [normalizedType, "BOTH"];
    const overlap = await prisma.customerReconciliation.findFirst({
      where: { customerId, deletedAt: null, reconcileType: { in: conflictingTypes }, periodStart: { lte: end }, periodEnd: { gte: start } },
      select: { periodStart: true, periodEnd: true },
    });
    if (overlap) {
      const streamName = normalizedType === "FEE_ONLY" ? "固费" : "销售佣金";
      return NextResponse.json({ error: `该客户的${streamName}周期与已有对账记录（${formatDate(overlap.periodStart)} 至 ${formatDate(overlap.periodEnd)}）重叠，请调整周期后重试` }, { status: 409 });
    }

    // 解析合同金额字段
    const feeAmount = parseMoneyString(contract.feeAmount);
    const commissionRate = parseRateString(contract.commissionRate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cAny = contract as any;

    // 从合同 v3 字段推断 betType / betOrderCount / betSalesAmount
    // 新逻辑：commissionType=THRESHOLD → 销售额对赌（金额=thresholdAmount）
    // 其他类型 + 兼容旧合同的 hasBet/betTarget
    const { betType, betOrderCount, betSalesAmount } = deriveBetFromContract({
      commissionType: cAny.commissionType ?? null,
      thresholdAmount: cAny.thresholdAmount ?? null,
      // 旧字段（向后兼容）
      hasBet: cAny.hasBet ?? null,
      betTarget: cAny.betTarget ?? null,
    });

    // 货币：固费用 contract.feeCurrency；抽佣/销售额用 thresholdCurrency > betTargetCurrency > feeCurrency
    const fixedFeeCurrency = contract.feeCurrency || "人民币";
    const commissionCurrency =
      cAny.thresholdCurrency ||
      cAny.betTargetCurrency ||
      contract.feeCurrency ||
      "人民币";

    const reconciliation = await prisma.customerReconciliation.create({
      data: {
        customerId,
        contractId,
        periodStart: start,
        periodEnd: end,
        // 快照合同条款
        partyA: contract.partyA,
        accountingPeriod: contract.accountingPeriod,
        feeCycle: contract.feeCycle,
        feeAmount,
        commissionRate,
        affiliateRule: contract.affiliateRule,
        paymentCycle: contract.paymentCycle,
        // 货币
        fixedFeeCurrency,
        commissionCurrency,
        // 对赌条款（自动从合同推断）
        betType,
        betOrderCount,
        betSalesAmount,
        reconcileType: normalizedType,
        createdById: session.userId,
        updatedAt: new Date(),
      },
      include: {
        customer: { select: { id: true, brandName: true } },
        contract: { select: { id: true, contractNo: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(reconciliation, { status: 201 });
  } catch (e) {
    if (e instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return errorResponse(e, "finance.reconciliation.create");
  }
}

const NEW_RECONCILIATION_TYPES = ["FEE_ONLY", "COMMISSION_ONLY"] as const;

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * 从合同字段推断 betType / betOrderCount / betSalesAmount
 *
 * 优先 v3 字段（commissionType + thresholdAmount）：
 *   - commissionType === "THRESHOLD" → 销售额对赌（target = thresholdAmount）
 *   - 其他类型 → 无对赌
 *
 * 旧合同兼容（hasBet + betTarget）：
 *   - hasBet === "true" 且 betTarget 含 "单" → ORDER_COUNT
 *   - hasBet === "true" 且其他 → SALES_AMOUNT
 *
 * 数字解析支持 "万"（×10000）、"亿"（×1e8）
 */
function deriveBetFromContract(c: {
  commissionType: string | null;
  thresholdAmount: string | null;
  hasBet: string | null;
  betTarget: string | null;
}): { betType: string; betOrderCount: number | null; betSalesAmount: number | null } {
  // v3 优先：THRESHOLD 机制 = 销售额对赌
  if (c.commissionType === "THRESHOLD" && c.thresholdAmount) {
    const n = parseNumberWithUnit(c.thresholdAmount);
    return {
      betType: "SALES_AMOUNT",
      betOrderCount: null,
      betSalesAmount: n,
    };
  }

  // 旧合同兼容
  if (c.hasBet === "true" && c.betTarget) {
    const num = parseNumberWithUnit(c.betTarget);
    if (/单/.test(c.betTarget)) {
      return {
        betType: "ORDER_COUNT",
        betOrderCount: Math.round(num),
        betSalesAmount: null,
      };
    }
    return {
      betType: "SALES_AMOUNT",
      betOrderCount: null,
      betSalesAmount: num,
    };
  }

  return { betType: "NONE", betOrderCount: null, betSalesAmount: null };
}

function parseNumberWithUnit(s: string): number {
  const numMatch = s.match(/[\d,.]+/);
  let num = numMatch ? Number(numMatch[0].replace(/,/g, "")) : 0;
  if (!Number.isFinite(num)) num = 0;
  if (/万/.test(s)) num *= 10000;
  if (/亿/.test(s)) num *= 100000000;
  return num;
}

/** 解析金额字符串，如 "¥5,000" → 5000 */
function parseMoneyString(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/[¥,\s]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** 解析比例字符串，如 "5%" → 0.05 */
function parseRateString(s: string | null | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[%\s]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  // 如果 > 1，认为是百分比形式（如 "5" → 0.05）
  return n > 1 ? n / 100 : n;
}
