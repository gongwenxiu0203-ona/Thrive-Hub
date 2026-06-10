"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, RotateCcw, CheckCircle2 } from "lucide-react";
import { saveEvaluation } from "@/actions/customers";
import { RATING_COLORS, RATING_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// 汇率（兑人民币）。如需调整请更新此处。
const FX_TO_CNY: Record<string, number> = { USD: 7.2, CNY: 1, EUR: 7.8, GBP: 9.2 };
const CUR_SYMBOL: Record<string, string> = { USD: "$", CNY: "¥", EUR: "€", GBP: "£" };
const CUR_OPTIONS = ["USD", "CNY", "EUR", "GBP"] as const;

export interface EvaluationData {
  revenueScore: 0 | 10 | 20;
  revenueMonthlyFee: number;
  revenueMonthlyFeeCur?: string;  // 基础月费货币（默认 USD）
  revenueCommRate: number;
  revenueGmv: number;
  revenueGmvCur?: string;         // 联盟月GMV货币（默认 USD）

  bsrScore: 0 | 10 | 20;
  bsrRank: number | null;

  mediaBuyScore: 0 | 10 | 20;
  mediaBuyOption: "A" | "B" | "C" | "";

  commissionScore: 0 | 10 | 20;
  commissionAvg: number;
  commissionOffer: number;

  categoryScore: 0 | 10 | 20;
  categoryMatches: number;
}

const EMPTY: EvaluationData = {
  revenueScore: 0, revenueMonthlyFee: 0, revenueMonthlyFeeCur: "USD", revenueCommRate: 0, revenueGmv: 0, revenueGmvCur: "USD",
  bsrScore: 0, bsrRank: null,
  mediaBuyScore: 0, mediaBuyOption: "",
  commissionScore: 0, commissionAvg: 0, commissionOffer: 0,
  categoryScore: 0, categoryMatches: 0,
};

/** 月收入换算成人民币 */
function revenueToCny(monthlyFee: number, feeCur: string, commRate: number, gmv: number, gmvCur: string): number {
  const feeRate = FX_TO_CNY[feeCur] ?? FX_TO_CNY.USD;
  const gmvRate = FX_TO_CNY[gmvCur] ?? FX_TO_CNY.USD;
  return monthlyFee * feeRate + (commRate / 100) * gmv * gmvRate;
}

function calcRevenueScore(monthlyFee: number, feeCur: string, commRate: number, gmv: number, gmvCur: string): 0 | 10 | 20 {
  const income = revenueToCny(monthlyFee, feeCur, commRate, gmv, gmvCur);
  if (income >= 20000) return 20;
  if (income >= 5000) return 10;
  return 0;
}

function calcBsrScore(rank: number | null): 0 | 10 | 20 {
  if (rank == null || rank <= 0) return 0;
  if (rank <= 20) return 20;
  if (rank <= 50) return 10;
  return 0;
}

function calcCommissionScore(avg: number, offer: number): 0 | 10 | 20 {
  const diff = offer - avg;
  if (diff > 5) return 20;
  if (diff >= 0) return 10;
  return 0;
}

function calcCategoryScore(matches: number): 0 | 10 | 20 {
  if (matches >= 15) return 20;
  if (matches >= 7) return 10;
  return 0;
}

function totalToGrade(total: number): string {
  if (total >= 80) return "S";
  if (total >= 60) return "A";
  if (total >= 40) return "B";
  return "C";
}

function ScoreOption({ label, score, selected, onClick }: {
  label: string; score: number; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all text-left w-full",
        selected
          ? "border-brand-500 bg-brand-50 text-brand-700 font-medium shadow-sm"
          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <span className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
        selected ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500",
      )}>{score}</span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function DimensionCard({ index, title, score, maxScore, children }: {
  index: string; title: string; score: number; maxScore: number; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-100 text-[10px] font-bold text-brand-700">{index}</span>
        <span className="flex-1 text-xs font-semibold text-slate-800">{title}</span>
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-bold",
          score === maxScore ? "bg-emerald-100 text-emerald-700" : score > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500",
        )}>
          {score}/{maxScore}
        </span>
      </div>
      <div className="border-t border-slate-200 bg-white rounded-b-xl p-3">{children}</div>
    </div>
  );
}

export function EvaluationModule({
  customerId,
  initialData,
  initialRating,
}: {
  customerId: string;
  initialData: EvaluationData | null;
  initialRating: string;
}) {
  const [mode, setMode] = useState<"view" | "edit">(initialData ? "view" : "edit");
  const [data, setData] = useState<EvaluationData>(initialData ?? EMPTY);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function set<K extends keyof EvaluationData>(key: K, value: EvaluationData[K]) {
    setData(prev => {
      const next = { ...prev, [key]: value };
      next.revenueScore = calcRevenueScore(next.revenueMonthlyFee, next.revenueMonthlyFeeCur ?? "USD", next.revenueCommRate, next.revenueGmv, next.revenueGmvCur ?? "USD");
      next.bsrScore = calcBsrScore(next.bsrRank);
      next.commissionScore = calcCommissionScore(next.commissionAvg, next.commissionOffer);
      next.categoryScore = calcCategoryScore(next.categoryMatches);
      if (next.mediaBuyOption === "A") next.mediaBuyScore = 20;
      else if (next.mediaBuyOption === "B") next.mediaBuyScore = 10;
      else next.mediaBuyScore = 0;
      return next;
    });
  }

  const total = data.revenueScore + data.bsrScore + data.mediaBuyScore + data.commissionScore + data.categoryScore;
  const grade = totalToGrade(total);

  function save() {
    startTransition(async () => {
      await saveEvaluation(customerId, data, grade);
      setMode("view");
      router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      await saveEvaluation(customerId, null, "PENDING");
      setData(EMPTY);
      setMode("edit");
      router.refresh();
    });
  }

  const rating = mode === "view" ? initialRating : grade;

  // Reusable action bar — rendered at both top and bottom
  function ActionBar() {
    if (mode === "view") {
      return (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            onClick={() => setMode("edit")}
          >
            重新评估
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            onClick={reset}
            disabled={pending}
          >
            <RotateCcw className="h-3 w-3" /> 清除内容
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          onClick={save}
          disabled={pending || total === 0}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {pending ? "保存中…" : `确认定级 · ${grade}级`}
        </button>
        {initialData && (
          <button
            type="button"
            className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            onClick={reset}
            disabled={pending}
          >
            <RotateCcw className="h-3 w-3" /> 清除内容
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden" style={{ maxHeight: "calc(100vh - 100px)" }}>
      {/* ── Title bar ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white">
        <span className="text-sm font-semibold text-slate-700">客户评估定级</span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", RATING_COLORS[rating] ?? "bg-slate-100 text-slate-600")}>
          {RATING_LABELS[rating] ?? rating}
        </span>
        {initialData && mode === "view" && (
          <span className="text-xs text-slate-400">
            总分 {initialData.revenueScore + initialData.bsrScore + initialData.mediaBuyScore + initialData.commissionScore + initialData.categoryScore} / 100
          </span>
        )}
        {mode === "edit" && total > 0 && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
            {total}分 → {grade}级
          </span>
        )}
      </div>

      {/* ── Top action bar ── */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <ActionBar />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {mode === "view" && initialData ? (
          /* Summary view */
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: "收入评估", score: initialData.revenueScore },
              { label: "产品排名", score: initialData.bsrScore },
              { label: "Media Buy", score: initialData.mediaBuyScore },
              { label: "高佣金", score: initialData.commissionScore },
              { label: "品类匹配", score: initialData.categoryScore },
            ].map(({ label, score }) => (
              <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center">
                <p className="text-[10px] text-slate-400">{label}</p>
                <p className={cn("mt-0.5 text-lg font-bold", score === 20 ? "text-emerald-600" : score > 0 ? "text-amber-600" : "text-slate-300")}>
                  {score}
                </p>
                <p className="text-[10px] text-slate-400">/ 20</p>
              </div>
            ))}
          </div>
        ) : (
          /* Edit / scoring mode */
          <div className="grid grid-cols-2 gap-3">
            {/* 1 收入评估 */}
            <DimensionCard index="1" title="收入评估" score={data.revenueScore} maxScore={20}>
              <p className="mb-2 text-xs text-slate-500">
                月收入 = 基础月费 + 抽佣比例 × 联盟月GMV，按汇率统一换算为人民币评估
              </p>
              <div className="grid gap-2 grid-cols-3">
                <div>
                  <label className="label text-xs">基础月费</label>
                  <div className="flex gap-1">
                    <select className="input text-sm w-[68px] shrink-0 px-1"
                      value={data.revenueMonthlyFeeCur ?? "USD"}
                      onChange={e => set("revenueMonthlyFeeCur", e.target.value)}>
                      {CUR_OPTIONS.map(c => <option key={c} value={c}>{CUR_SYMBOL[c]}{c}</option>)}
                    </select>
                    <input type="number" min={0} className="input text-sm" value={data.revenueMonthlyFee || ""}
                      onChange={e => set("revenueMonthlyFee", Number(e.target.value))} placeholder="0" />
                  </div>
                </div>
                <div>
                  <label className="label text-xs">抽佣比例(%)</label>
                  <input type="number" min={0} max={100} step={0.1} className="input text-sm" value={data.revenueCommRate || ""}
                    onChange={e => set("revenueCommRate", Number(e.target.value))} placeholder="0" />
                </div>
                <div>
                  <label className="label text-xs">联盟月GMV</label>
                  <div className="flex gap-1">
                    <select className="input text-sm w-[68px] shrink-0 px-1"
                      value={data.revenueGmvCur ?? "USD"}
                      onChange={e => set("revenueGmvCur", e.target.value)}>
                      {CUR_OPTIONS.map(c => <option key={c} value={c}>{CUR_SYMBOL[c]}{c}</option>)}
                    </select>
                    <input type="number" min={0} className="input text-sm" value={data.revenueGmv || ""}
                      onChange={e => set("revenueGmv", Number(e.target.value))} placeholder="0" />
                  </div>
                </div>
              </div>
              {(data.revenueMonthlyFee > 0 || data.revenueCommRate > 0 || data.revenueGmv > 0) && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  预计月收入：约 <strong>¥{Math.round(revenueToCny(data.revenueMonthlyFee, data.revenueMonthlyFeeCur ?? "USD", data.revenueCommRate, data.revenueGmv, data.revenueGmvCur ?? "USD")).toLocaleString()}</strong>
                  {" · "}得分：<strong className="text-brand-600">{data.revenueScore}</strong>
                  <span className="ml-1 text-[10px] text-slate-400">（汇率 USD7.2/EUR7.8/GBP9.2）</span>
                </p>
              )}
            </DimensionCard>

            {/* 2 产品排名 */}
            <DimensionCard index="2" title="产品排名 BSR" score={data.bsrScore} maxScore={20}>
              <p className="mb-2 text-xs text-slate-500">参考客户 Storefront Page 上的 BSR 排名</p>
              <div className="mb-2 max-w-xs">
                <label className="label text-xs">BSR 排名（前 N 名）</label>
                <input type="number" min={1} className="input text-sm" value={data.bsrRank ?? ""}
                  onChange={e => set("bsrRank", e.target.value ? Number(e.target.value) : null)} placeholder="例：15" />
              </div>
              <div className="flex flex-col gap-1.5">
                <ScoreOption score={20} label="BSR Top 20以内 — 绝对头部，转化率有保障" selected={data.bsrScore === 20} onClick={() => { set("bsrRank", 10); }} />
                <ScoreOption score={10} label="BSR Top 50以内 — 中腰部，呈上升趋势" selected={data.bsrScore === 10} onClick={() => { set("bsrRank", 35); }} />
                <ScoreOption score={0} label="排名靠后或无自然流量支撑" selected={data.bsrScore === 0 && data.bsrRank !== null} onClick={() => { set("bsrRank", 100); }} />
              </div>
            </DimensionCard>

            {/* 3 Media Buy资源 */}
            <DimensionCard index="3" title="Media Buy 资源" score={data.mediaBuyScore} maxScore={20}>
              <p className="mb-2 text-xs text-slate-500">参考 Buyerguide / Exon / Amobeez / Roundforest 等平台资源情况</p>
              <div className="flex flex-col gap-1.5">
                <ScoreOption score={20} label="内部 Media Buyer 跑过该类目且拥有该品牌" selected={data.mediaBuyOption === "A"} onClick={() => set("mediaBuyOption", "A")} />
                <ScoreOption score={10} label="Buyer 跑过相关类目，但没有该品牌" selected={data.mediaBuyOption === "B"} onClick={() => set("mediaBuyOption", "B")} />
                <ScoreOption score={0} label="全盲区，需从零开荒" selected={data.mediaBuyOption === "C"} onClick={() => set("mediaBuyOption", "C")} />
              </div>
            </DimensionCard>

            {/* 4 高佣金 */}
            <DimensionCard index="4" title="高佣金" score={data.commissionScore} maxScore={20}>
              <p className="mb-2 text-xs text-slate-500">参考 Archer / Wayward / PartnerBoost 同行佣金</p>
              <div className="grid gap-2 grid-cols-2">
                <div>
                  <label className="label text-xs">同行佣金均值(%)</label>
                  <input type="number" min={0} max={100} step={0.1} className="input text-sm" value={data.commissionAvg || ""}
                    onChange={e => set("commissionAvg", Number(e.target.value))} placeholder="0" />
                </div>
                <div>
                  <label className="label text-xs">客户提供佣金(%)</label>
                  <input type="number" min={0} max={100} step={0.1} className="input text-sm" value={data.commissionOffer || ""}
                    onChange={e => set("commissionOffer", Number(e.target.value))} placeholder="0" />
                </div>
              </div>
              {(data.commissionAvg > 0 || data.commissionOffer > 0) && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  差值：<strong className={data.commissionOffer >= data.commissionAvg ? "text-emerald-600" : "text-rose-600"}>
                    {(data.commissionOffer - data.commissionAvg).toFixed(1)}%
                  </strong>{" · "}得分：<strong className="text-brand-600">{data.commissionScore}</strong>
                </p>
              )}
            </DimensionCard>

            {/* 5 品类匹配度 */}
            <div className="col-span-2">
            <DimensionCard index="5" title="品类匹配度" score={data.categoryScore} maxScore={20}>
              <p className="mb-2 text-xs text-slate-500">进入联盟资源库匹配，统计头部联盟商（历史销售超过 $20万）数量</p>
              <div className="mb-2 max-w-xs">
                <label className="label text-xs">匹配联盟商数量</label>
                <input type="number" min={0} className="input text-sm" value={data.categoryMatches || ""}
                  onChange={e => set("categoryMatches", Number(e.target.value))} placeholder="0" />
              </div>
              <div className="flex flex-col gap-1.5">
                <ScoreOption score={20} label="≥15个 头部联盟商高度重合" selected={data.categoryScore === 20} onClick={() => set("categoryMatches", 15)} />
                <ScoreOption score={10} label="≥7个 库内有一定联盟商" selected={data.categoryScore === 10} onClick={() => set("categoryMatches", 7)} />
                <ScoreOption score={0} label="<7个 资源匮乏，需从零开挖" selected={data.categoryScore === 0 && data.categoryMatches > 0} onClick={() => set("categoryMatches", 0)} />
              </div>
            </DimensionCard>
            </div>

            {/* Total */}
            <div className="col-span-2"><div className="flex items-center justify-between rounded-xl border-2 border-brand-200 bg-brand-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">综合得分</span>
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  {[["收入", data.revenueScore], ["排名", data.bsrScore], ["MB", data.mediaBuyScore], ["佣金", data.commissionScore], ["品类", data.categoryScore]].map(([label, score]) => (
                    <span key={label} className="text-center">
                      <span className="block text-[10px] text-slate-400">{label}</span>
                      <span className="text-sm font-bold text-slate-700">{score}</span>
                    </span>
                  ))}
                </div>
                <span className="text-2xl font-black text-brand-700">{total}</span>
                <span className={cn("rounded-full px-3 py-1 text-sm font-bold", RATING_COLORS[grade])}>
                  {grade}级
                </span>
              </div>
            </div></div>
          </div>
        )}
      </div>

      {/* ── Bottom action bar ── */}
      <div className="px-4 pt-2 pb-3 border-t border-slate-100">
        <ActionBar />
      </div>
    </div>
  );
}
