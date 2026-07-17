import { prisma } from "@/lib/prisma";
import { calcCommission } from "@/lib/commissionCalc";

export async function recalcReconciliation(
  recId: string,
  patch: Record<string, unknown>,
): Promise<{ actualCommissionRate: number; commissionAmount: number; betResult: string }> {
  const rec = await prisma.customerReconciliation.findUnique({
    where: { id: recId },
    select: {
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
  if (!rec) return { actualCommissionRate: 0, commissionAmount: 0, betResult: "NA" };

  const actualSalesAmount = typeof patch.actualSalesAmount === "number"
    ? patch.actualSalesAmount
    : rec.actualSalesAmount;
  const gmvBaseline = typeof patch.gmvBaseline === "number"
    ? patch.gmvBaseline
    : (rec.gmvBaseline ?? null);
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
    betResult: "NA",
  };
}

function parseRatePctServer(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value > 1 ? value / 100 : value;
  const parsed = Number(String(value).replace(/[%\s]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

export function calcBetAndCommission(rec: {
  betType?: string;
  betOrderCount?: number | null;
  betSalesAmount?: number | null;
  actualOrders?: number;
  actualSalesAmount: number;
  commissionRate: number;
}) {
  const actualCommissionRate = rec.commissionRate;
  const commissionAmount = rec.actualSalesAmount * actualCommissionRate;
  return { betResult: "NA", actualCommissionRate, commissionAmount };
}
