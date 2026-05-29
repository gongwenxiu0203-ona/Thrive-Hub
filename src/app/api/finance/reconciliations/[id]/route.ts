import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { calcCommission } from "@/lib/commissionCalc";

// GET /api/finance/reconciliations/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;

    const rec = await prisma.customerReconciliation.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            brandName: true,
            channelUserId: true,
            businessOwnerId: true,
            businessOwner: { select: { id: true, name: true, email: true } },
          },
        },
        contract: { select: { id: true, contractNo: true, type: true, startDate: true, endDate: true } },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        reviews: {
          include: { reviewer: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        settlements: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { type: "asc" },
        },
      },
    });

    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rec);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// PATCH /api/finance/reconciliations/[id]
// - 货币字段（fixedFeeCurrency / commissionCurrency）：任何状态均可修改
// - 其他对账字段：仅 DRAFT 状态可修改
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.customerReconciliation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 货币字段任何状态可改
    const currencyFields = ["fixedFeeCurrency", "commissionCurrency"];
    const draftOnlyFields = [
      "periodStart", "periodEnd",
      "betType", "betOrderCount", "betSalesAmount",
      "actualOrders", "actualSalesAmount",
      "gmvBaseline", // EXCESS 模式手动填写
    ];

    const data: Record<string, unknown> = { updatedAt: new Date() };

    // 货币字段
    for (const key of currencyFields) {
      if (key in body) data[key] = body[key];
    }

    // 草稿专属字段
    const hasDraftFields = draftOnlyFields.some((k) => k in body);
    if (hasDraftFields) {
      if (existing.status !== "DRAFT") {
        return NextResponse.json({ error: "只能修改草稿状态的对账记录" }, { status: 400 });
      }
      for (const key of draftOnlyFields) {
        if (key in body) {
          if (key === "periodStart" || key === "periodEnd") {
            data[key] = new Date(body[key]);
          } else {
            data[key] = body[key];
          }
        }
      }
      // 重新计算抽佣（v3：根据合同 commissionType + 阶梯/门槛/超额逻辑）
      const updated = { ...existing, ...data };
      const calc = await recalcReconciliation(id, updated as Record<string, unknown>);
      Object.assign(data, calc);
    }

    const result = await prisma.customerReconciliation.update({ where: { id }, data });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

// DELETE /api/finance/reconciliations/[id] — 软删除单条月度对账
// 设置 deletedAt = now()，7 天内可恢复，到期后访问列表时自动物理清理
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const existing = await prisma.customerReconciliation.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.customerReconciliation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}

/**
 * v3 抽佣重算（基于合同 commissionType + 实际销售额）。
 * 回退：合同字段缺失时使用旧的对赌逻辑（FIXED 行为）。
 */
export async function recalcReconciliation(
  recId: string,
  patch: Record<string, unknown>,
): Promise<{
  actualCommissionRate: number;
  commissionAmount: number;
  betResult: string;
}> {
  // 取最新合同 v3 字段
  const rec = await prisma.customerReconciliation.findUnique({
    where: { id: recId },
    select: {
      contractId: true,
      commissionRate: true,
      actualSalesAmount: true,
      gmvBaseline: true,
      contract: {
        select: {
          commissionType: true,
          commissionRate: true,
          thresholdAmount: true,
          tieredRules: true,
        },
      },
    },
  });
  if (!rec) {
    return { actualCommissionRate: 0, commissionAmount: 0, betResult: "NA" };
  }

  const actualSalesAmount =
    typeof patch.actualSalesAmount === "number"
      ? patch.actualSalesAmount
      : rec.actualSalesAmount;
  const gmvBaseline =
    typeof patch.gmvBaseline === "number"
      ? patch.gmvBaseline
      : (rec.gmvBaseline ?? null);

  // 优先用合同的最新比例（避免快照陈旧），失败回退到对账记录的快照
  const contractRateParsed = parseRatePctServer(rec.contract?.commissionRate);
  const contractRate = contractRateParsed > 0 ? contractRateParsed : rec.commissionRate;

  const result = calcCommission({
    commissionType: rec.contract?.commissionType ?? "FIXED",
    contractRate,
    thresholdAmount: rec.contract?.thresholdAmount ?? null,
    tieredRules: rec.contract?.tieredRules ?? null,
    gmvBaseline,
    actualSalesAmount,
  });

  return {
    actualCommissionRate: result.actualCommissionRate,
    commissionAmount: result.commissionAmount,
    betResult: "NA", // v3 不再使用 betResult，统一标 NA
  };
}

/** 把 "1.5%" / "0.015" / 1.5 / 0.015 都转为小数（0.015） */
function parseRatePctServer(s: string | number | null | undefined): number {
  if (s == null || s === "") return 0;
  if (typeof s === "number") return s > 1 ? s / 100 : s;
  const n = Number(String(s).replace(/[%\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

/** 兼容旧 review/route.ts 的导出 — 内部已切换到 recalcReconciliation */
export function calcBetAndCommission(rec: {
  betType: string;
  betOrderCount?: number | null;
  betSalesAmount?: number | null;
  actualOrders: number;
  actualSalesAmount: number;
  commissionRate: number;
}) {
  // 退化为 FIXED 行为（v3 模式下 review 异议时使用）
  const actualCommissionRate = rec.commissionRate;
  const commissionAmount = rec.actualSalesAmount * actualCommissionRate;
  return { betResult: "NA", actualCommissionRate, commissionAmount };
}
