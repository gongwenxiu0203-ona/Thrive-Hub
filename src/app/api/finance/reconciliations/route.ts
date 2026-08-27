import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getReconciliationAccess } from "@/lib/reconciliationAccess";
import { FeaturePermissionError } from "@/lib/permissionGuard";
import { parseDateOnlyUtc } from "@/lib/dateRange";
import { errorResponse } from "@/lib/appError";
import { financeReferenceCustomerScope } from "@/lib/dataScope";
import { buildManualReconciliationContractPlans } from "@/lib/customerReconciliationPlan";

function reconciliationCurrency(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (["美金", "美元", "US$", "$"].includes(normalized)) return "USD";
  if (["人民币", "人民币元", "RMB", "¥", "￥"].includes(normalized)) return "CNY";
  return normalized || "USD";
}

// GET /api/finance/reconciliations — 获取对账列表
export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const access = await getReconciliationAccess(session, "READ", req, true);
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
    await getReconciliationAccess(session, "EDIT", req);
    const referenceCustomerScope = financeReferenceCustomerScope(session);
    const body = await req.json();
    const {
      customerId,
      contractId,
      contractIds,
      periodStart,
      periodEnd,
      reconcileType,
      reconcileTypes,
      source,
      adjustmentReason,
    } = body;

    const selectedContractIds = Array.from(new Set(
      (Array.isArray(contractIds) ? contractIds : [contractId])
        .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
        .map((value) => value.trim()),
    ));
    if (!customerId || selectedContractIds.length === 0) {
      return NextResponse.json({ error: "客户和关联合同均为必填项" }, { status: 400 });
    }
    if (selectedContractIds.length > 50) {
      return NextResponse.json({ error: "一次最多选择 50 份合同创建客户对账" }, { status: 400 });
    }

    const normalizedTypes = Array.isArray(reconcileTypes)
      ? [...new Set(reconcileTypes)]
      : [reconcileType].filter(Boolean);
    if (
      normalizedTypes.length === 0 ||
      normalizedTypes.some((type) => !NEW_RECONCILIATION_TYPES.includes(type))
    ) {
      return NextResponse.json({ error: "新建对账必须分开选择固费或销售佣金，不再支持合并对账" }, { status: 400 });
    }
    const requestedStart = typeof periodStart === "string" ? parseDateOnlyUtc(periodStart) : null;
    const requestedEnd = typeof periodEnd === "string" ? parseDateOnlyUtc(periodEnd) : null;
    if (selectedContractIds.length === 1 && (!requestedStart || !requestedEnd)) {
      return NextResponse.json({ error: "单合同创建时，对账周期开始和结束日期均为必填项" }, { status: 400 });
    }
    if (requestedStart && requestedEnd && requestedStart > requestedEnd) {
      return NextResponse.json({ error: "对账周期结束时间不能早于开始时间" }, { status: 400 });
    }
    const normalizedSource = source === "ADJUSTMENT" ? "ADJUSTMENT" : "MANUAL";
    if (normalizedSource === "ADJUSTMENT" && (!adjustmentReason || !String(adjustmentReason).trim())) {
      return NextResponse.json({ error: "新增调整单时必须填写调整原因" }, { status: 400 });
    }

    // 获取合同信息，快照到对账记录
    const contracts = await prisma.contract.findMany({
      where: {
        id: { in: selectedContractIds },
        customerId,
        deletedAt: null,
        customer: { ...referenceCustomerScope, deletedAt: null, status: "COOPERATING" },
      },
    });
    if (contracts.length !== selectedContractIds.length) {
      return NextResponse.json({ error: "部分合同不存在、不属于该客户，或客户当前不是合作中状态" }, { status: 404 });
    }
    const incompleteContract = contracts.find((contract) => contract.status !== "COMPLETED");
    if (incompleteContract) {
      return NextResponse.json({ error: `合同 ${incompleteContract.contractNo} 尚未签署完成，不能创建对账` }, { status: 400 });
    }
    const missingDatesContract = contracts.find((contract) => !contract.startDate || !contract.endDate);
    if (missingDatesContract) {
      return NextResponse.json({ error: `合同 ${missingDatesContract.contractNo} 缺少有效开始或结束日期` }, { status: 400 });
    }
    if (selectedContractIds.length > 1) {
      const allEligibleContracts = await prisma.contract.findMany({
        where: {
          customerId,
          status: "COMPLETED",
          deletedAt: null,
          startDate: { not: null },
          endDate: { not: null },
          customer: { ...referenceCustomerScope, deletedAt: null, status: "COOPERATING" },
        },
        select: { id: true },
      });
      const selectedIdSet = new Set(selectedContractIds);
      if (
        allEligibleContracts.length !== selectedContractIds.length
        || allEligibleContracts.some((contract) => !selectedIdSet.has(contract.id))
      ) {
        return NextResponse.json({ error: "多合同创建时必须选择该客户的全部有效已完成合同" }, { status: 400 });
      }
    }
    if (selectedContractIds.length === 1 && requestedStart && requestedEnd) {
      const contract = contracts[0];
      if (requestedStart < contract.startDate! || requestedEnd > contract.endDate!) {
        return NextResponse.json({ error: "手动对账周期不能超出合同有效期" }, { status: 400 });
      }
    }

    const plans = buildManualReconciliationContractPlans({
      contracts: contracts.map((contract) => ({
        contractId: contract.id,
        contractStart: contract.startDate!,
        contractEnd: contract.endDate!,
      })),
      reconcileTypes: normalizedTypes as ("FEE_ONLY" | "COMMISSION_ONLY")[],
      requestedStart,
      requestedEnd,
    });

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
    const reconciliations = await prisma.$transaction(async (tx) => {
      // 整批先查重，全部通过后才开始写入，避免多合同只创建一部分。
      for (const plan of plans) {
        const contract = contractById.get(plan.contractId)!;
        for (const period of plan.periods) {
          const overlap = await tx.customerReconciliation.findFirst({
            where: {
              contractId: plan.contractId,
              deletedAt: null,
              reconcileType: { in: [period.type, "BOTH"] },
              periodStart: { lte: period.end },
              periodEnd: { gte: period.start },
            },
            select: { periodStart: true, periodEnd: true },
          });
          if (overlap) {
            const streamName = period.type === "FEE_ONLY" ? "固费" : "销售佣金";
            throw new ReconciliationOverlapError(
              `合同 ${contract.contractNo} 的${streamName}周期与已有对账记录（${formatDate(overlap.periodStart)} 至 ${formatDate(overlap.periodEnd)}）重叠，整批未创建任何记录`,
            );
          }
        }
      }

      const created = [];
      for (const plan of plans) {
        const contract = contractById.get(plan.contractId)!;
        const cAny = contract as typeof contract & {
          commissionType?: string | null;
          thresholdAmount?: string | null;
          hasBet?: string | null;
          betTarget?: string | null;
        };
        const { betType, betOrderCount, betSalesAmount } = deriveBetFromContract({
          commissionType: cAny.commissionType ?? null,
          thresholdAmount: cAny.thresholdAmount ?? null,
          hasBet: cAny.hasBet ?? null,
          betTarget: cAny.betTarget ?? null,
        });
        for (const period of plan.periods) {
          created.push(await tx.customerReconciliation.create({
            data: {
              customerId,
              contractId: contract.id,
              source: normalizedSource,
              planStatus: period.start <= today ? "OPEN" : "PLANNED",
              periodIndex: period.index,
              adjustmentReason: normalizedSource === "ADJUSTMENT" ? String(adjustmentReason).trim() : null,
              originalPeriodStart: plan.contractStart,
              originalPeriodEnd: plan.contractEnd,
              openedAt: period.start <= today ? now : null,
              periodStart: period.start,
              periodEnd: period.end,
              partyA: contract.partyA,
              accountingPeriod: contract.accountingPeriod,
              feeCycle: contract.feeCycle,
              feeAmount: parseMoneyString(contract.feeAmount),
              commissionRate: parseRateString(contract.commissionRate),
              affiliateRule: contract.affiliateRule,
              paymentCycle: contract.paymentCycle,
              fixedFeeCurrency: reconciliationCurrency(contract.feeCurrency),
              commissionCurrency: "USD",
              betType,
              betOrderCount,
              betSalesAmount,
              reconcileType: period.type,
              createdById: session.userId,
              updatedAt: now,
            },
            include: {
              customer: { select: { id: true, brandName: true } },
              contract: { select: { id: true, contractNo: true } },
              createdBy: { select: { id: true, name: true } },
            },
          }));
        }
      }
      return created;
    });

    return NextResponse.json(
      { ...reconciliations[0], id: reconciliations[0].id, firstId: reconciliations[0].id, createdCount: reconciliations.length, contractCount: plans.length },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof FeaturePermissionError) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    if (e instanceof ReconciliationOverlapError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    return errorResponse(e, "finance.reconciliation.create");
  }
}

class ReconciliationOverlapError extends Error {}

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
