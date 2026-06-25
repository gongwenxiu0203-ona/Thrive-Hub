// V3 联盟归因 GMV 佣金计算
// 输入：合同结算方式 + 实际销售额 + （阶梯规则/门槛/基准）
// 输出：当前抽佣比例、抽佣金额、说明文字

export type CommissionInputs = {
  commissionType: string;           // FIXED | THRESHOLD | TIERED | EXCESS
  contractRate: number;             // 合同抽佣比例（小数，0.05 = 5%）
  thresholdAmount?: string | null;  // THRESHOLD 模式：门槛金额（仅数字字符串）
  tieredRules?: string | null;      // TIERED 模式：JSON {currency, tiers:[{from,to,rate}]}
  gmvBaseline?: number | null;      // EXCESS 模式：GMV 基准值（手动填）
  actualSalesAmount: number;        // 实际销售额
};

export type CommissionResult = {
  actualCommissionRate: number;     // 当前抽佣比例（小数）
  commissionAmount: number;         // 待支付抽佣金额
  formula: string;                  // 给用户看的公式说明
  note?: string;                    // 额外说明（如"未达门槛"/"超额部分小于 0 故记为 0"）
};

/** 解析比例字符串 "5%" → 0.05；如果已是小数则原样返回 */
function parseRate(s: string | number | null | undefined): number {
  if (typeof s === "number") return s > 1 ? s / 100 : s;
  if (!s) return 0;
  const cleaned = String(s).replace(/[%\s]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

/** 解析金额字符串"100,000" → 100000 */
function parseAmount(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Number(String(s).replace(/[¥￥$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function calcCommission(inp: CommissionInputs): CommissionResult {
  const sales = inp.actualSalesAmount ?? 0;
  const baseRate = inp.contractRate ?? 0;

  switch (inp.commissionType) {
    case "THRESHOLD": {
      const threshold = parseAmount(inp.thresholdAmount);
      if (sales >= threshold && threshold > 0) {
        const amt = sales * baseRate;
        return {
          actualCommissionRate: baseRate,
          commissionAmount: amt,
          formula: `${(baseRate * 100).toFixed(2)}% × ${sales.toLocaleString("zh-CN")} = ${amt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`,
          note: `已达 GMV 门槛 ${threshold.toLocaleString("zh-CN")}`,
        };
      }
      return {
        actualCommissionRate: 0,
        commissionAmount: 0,
        formula: "—",
        note:
          threshold > 0
            ? `未达 GMV 门槛 ${threshold.toLocaleString("zh-CN")}，抽佣比例为 0`
            : "门槛金额未设置，抽佣比例为 0",
      };
    }

    case "TIERED": {
      const tier = pickTier(inp.tieredRules, sales);
      if (!tier) {
        return {
          actualCommissionRate: 0,
          commissionAmount: 0,
          formula: "—",
          note: "未匹配到阶梯区间，抽佣比例为 0",
        };
      }
      const rate = parseRate(tier.rate);
      const amt = sales * rate;
      return {
        actualCommissionRate: rate,
        commissionAmount: amt,
        formula: `${(rate * 100).toFixed(2)}% × ${sales.toLocaleString("zh-CN")} = ${amt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`,
        note: `命中区间 ${tier.label}`,
      };
    }

    case "EXCESS":
    case "INCREMENTAL": {
      const baseline = inp.gmvBaseline ?? 0;
      const excess = sales - baseline;
      const amt = Math.max(0, excess * baseRate);
      return {
        actualCommissionRate: baseRate,
        commissionAmount: amt,
        formula: `(${sales.toLocaleString("zh-CN")} − ${baseline.toLocaleString("zh-CN")}) × ${(baseRate * 100).toFixed(2)}% = ${(excess * baseRate).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}${excess < 0 ? "（< 0，故记为 0）" : ""}`,
        note:
          baseline <= 0
            ? "尚未填写 GMV 基准值，请先填写后计算"
            : excess < 0
              ? "实际销售额未超过基准值，抽佣金额为 0"
              : undefined,
      };
    }

    case "SPECIAL": {
      return {
        actualCommissionRate: 0,
        commissionAmount: 0,
        formula: "—",
        note: "特殊佣金需按合同条款人工结算，系统不自动套用固定比例",
      };
    }

    case "FIXED":
    default: {
      const amt = sales * baseRate;
      return {
        actualCommissionRate: baseRate,
        commissionAmount: amt,
        formula: `${(baseRate * 100).toFixed(2)}% × ${sales.toLocaleString("zh-CN")} = ${amt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`,
      };
    }
  }
}

// ── 阶梯规则匹配 ──────────────────────────────────────────────────────────────
type Tier = { from: string; to: string; rate: string };

function pickTier(
  raw: string | null | undefined,
  sales: number,
): { from: number; to: number | null; rate: string; label: string } | null {
  if (!raw) return null;
  let parsed: { currency: string; tiers: Tier[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const sym = parsed.currency === "美金" ? "$" : "¥";
  if (!parsed?.tiers?.length) return null;

  for (let i = 0; i < parsed.tiers.length; i++) {
    const t = parsed.tiers[i];
    const from = parseAmount(t.from || "0");
    const toRaw = t.to?.trim();
    const isLast = !toRaw;
    const to = isLast ? null : parseAmount(toRaw);

    if (sales >= from && (to == null || sales <= to)) {
      const label = isLast
        ? `${sym}${from.toLocaleString("zh-CN")} 及以上`
        : i === 0
          ? `0 - ${sym}${to!.toLocaleString("zh-CN")}`
          : `${sym}${from.toLocaleString("zh-CN")} - ${sym}${to!.toLocaleString("zh-CN")}`;
      return { from, to, rate: t.rate, label };
    }
  }
  return null;
}
