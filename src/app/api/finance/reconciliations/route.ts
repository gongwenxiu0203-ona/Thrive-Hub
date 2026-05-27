import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// GET /api/finance/reconciliations — 获取对账列表
export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const reconciliations = await prisma.customerReconciliation.findMany({
      where,
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// POST /api/finance/reconciliations — 新建对账记录
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const {
      customerId,
      contractId,
      periodStart,
      periodEnd,
      betType = "NONE",
      betOrderCount,
      betSalesAmount,
    } = body;

    if (!customerId || !contractId || !periodStart || !periodEnd) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    // 获取合同信息，快照到对账记录
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      return NextResponse.json({ error: "合同不存在" }, { status: 404 });
    }
    if (contract.status !== "COMPLETED") {
      return NextResponse.json({ error: "只能对已签署完成的合同创建对账" }, { status: 400 });
    }

    // 解析合同金额字段
    const feeAmount = parseMoneyString(contract.feeAmount);
    const commissionRate = parseRateString(contract.commissionRate);

    const reconciliation = await prisma.customerReconciliation.create({
      data: {
        customerId,
        contractId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        // 快照合同条款
        partyA: contract.partyA,
        accountingPeriod: contract.accountingPeriod,
        feeCycle: contract.feeCycle,
        feeAmount,
        commissionRate,
        affiliateRule: contract.affiliateRule,
        paymentCycle: contract.paymentCycle,
        // 对赌条款
        betType,
        betOrderCount: betOrderCount ?? null,
        betSalesAmount: betSalesAmount ?? null,
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
    console.error(e);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
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
