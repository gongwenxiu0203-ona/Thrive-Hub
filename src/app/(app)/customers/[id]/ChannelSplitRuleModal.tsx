"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Percent, Plus, Trash2, Save, Sparkles } from "lucide-react";
import { upsertChannelSplitRule, deleteChannelSplitRule } from "@/actions/channelSplit";
import { Modal } from "@/components/ui/Modal";

type Tier = { gmvMin: number; gmvMax: number | null; rate: number };

export interface ExistingRule {
  id: string;
  ruleType: "A" | "B";
  splitEndDate: string;       // ISO
  fixedFeeRate: number;
  commissionRate: number | null;
  tieredRules: string;        // JSON
  commissionThresholdAmount?: number;
  commissionThresholdCurrency?: string;
  commissionBelowRate?: number;
  commissionAtOrAboveRate?: number;
}

const FIXED_PRESETS = [0.15, 0.25];

function toPct(r: number | null | undefined): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return "";
  return (r * 100).toFixed(2).replace(/\.?0+$/, "");
}
function fromPct(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return n / 100;
}

export function ChannelSplitRuleModal({
  customerId,
  contractId,
  isAdmin,
  existing,
  inheritedCustomerRule = null,
}: {
  customerId: string;
  contractId?: string;
  isAdmin: boolean;
  existing: ExistingRule | null;
  inheritedCustomerRule?: ExistingRule | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isInherited = Boolean(contractId && inheritedCustomerRule);
  const displayedRule = inheritedCustomerRule ?? existing;

  const initialTiers: Tier[] = (() => {
    if (!displayedRule) return [{ gmvMin: 0, gmvMax: 100000, rate: 0.15 }, { gmvMin: 100000, gmvMax: null, rate: 0.2 }];
    try {
      const parsed = JSON.parse(displayedRule.tieredRules) as Tier[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ gmvMin: 0, gmvMax: null, rate: 0.15 }];
    } catch {
      return [{ gmvMin: 0, gmvMax: null, rate: 0.15 }];
    }
  })();

  const [ruleType, setRuleType] = useState<"A" | "B">(displayedRule?.ruleType ?? "A");
  const [splitEndDate, setSplitEndDate] = useState(displayedRule?.splitEndDate?.slice(0, 10) ?? "2026-12-31");
  const [fixedFeePct, setFixedFeePct] = useState(toPct(displayedRule?.fixedFeeRate ?? 0.15));
  const [commissionThreshold, setCommissionThreshold] = useState(
    String(displayedRule?.commissionThresholdAmount ?? 4400),
  );
  const [commissionBelowPct, setCommissionBelowPct] = useState(
    toPct(displayedRule?.commissionBelowRate ?? 0.15),
  );
  const [commissionAtOrAbovePct, setCommissionAtOrAbovePct] = useState(
    toPct(displayedRule?.commissionAtOrAboveRate ?? 0.25),
  );
  const [tiers, setTiers] = useState<Tier[]>(initialTiers);

  function addTier() {
    const last = tiers[tiers.length - 1];
    const nextMin = last ? (last.gmvMax ?? last.gmvMin + 100000) : 0;
    setTiers([...tiers, { gmvMin: nextMin, gmvMax: null, rate: 0.25 }]);
  }
  function removeTier(i: number) {
    setTiers(tiers.filter((_, k) => k !== i));
  }
  function updateTier(i: number, patch: Partial<Tier>) {
    setTiers(tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  }

  function submit() {
    if (isInherited) return;
    setError(null);
    if (!splitEndDate) { setError("请填写分账截止日期"); return; }
    const fixedRate = fromPct(fixedFeePct);
    if (!Number.isFinite(fixedRate) || fixedRate < 0 || fixedRate > 1) {
      setError("固费分账比例需在 0~100 之间"); return;
    }
    let commissionRate: number | null = null;
    let tieredRules: Tier[] = [];
    if (ruleType === "A") {
      const threshold = Number(commissionThreshold);
      const belowRate = fromPct(commissionBelowPct);
      const atOrAboveRate = fromPct(commissionAtOrAbovePct);
      if (!Number.isFinite(threshold) || threshold < 0) {
        setError("佣金到账阈值必须大于或等于 0"); return;
      }
      if (!Number.isFinite(belowRate) || belowRate < 0 || belowRate > 1) {
        setError("低于阈值的分账比例需在 0~100 之间"); return;
      }
      if (!Number.isFinite(atOrAboveRate) || atOrAboveRate < 0 || atOrAboveRate > 1) {
        setError("达到阈值的分账比例需在 0~100 之间"); return;
      }
      // Keep the legacy flat-rate field populated for backward compatibility.
      commissionRate = belowRate;
    } else {
      if (tiers.length === 0) { setError("请至少配置一档阶梯比例"); return; }
      for (const t of tiers) {
        if (!Number.isFinite(t.gmvMin) || t.gmvMin < 0) { setError("阶梯 GMV 下界必须 ≥ 0"); return; }
        if (t.gmvMax !== null && (!Number.isFinite(t.gmvMax) || t.gmvMax <= t.gmvMin)) { setError("阶梯 GMV 上界必须大于下界"); return; }
        if (!Number.isFinite(t.rate) || t.rate < 0 || t.rate > 1) { setError("阶梯比例需在 0~100% 之间"); return; }
      }
      tieredRules = tiers;
    }

    startTransition(async () => {
      const r = await upsertChannelSplitRule({
        customerId,
        contractId,
        ruleType,
        splitEndDate,
        fixedFeeRate: fixedRate,
        commissionRate,
        tieredRules,
        commissionThresholdAmount: Number(commissionThreshold),
        commissionThresholdCurrency: "USD",
        commissionBelowRate: fromPct(commissionBelowPct),
        commissionAtOrAboveRate: fromPct(commissionAtOrAbovePct),
      });
      if (!r.ok) { setError(r.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (!displayedRule) return;
    if (!confirm("确认删除分账规则？此操作不影响已生成的分账记录。")) return;
    startTransition(async () => {
      const r = await deleteChannelSplitRule(customerId, contractId);
      if (!r.ok) { setError(r.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={contractId
          ? "btn-secondary flex items-center gap-1.5 text-sm"
          : "flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/30 transition-colors"
        }
        title="配置渠道商分账规则（A 基础 / B 阶梯）"
      >
        <Percent className="h-4 w-4" />
        分账规则{existing ? `（${existing.ruleType}）` : ""}
      </button>

      {open && (
        <Modal open onClose={() => setOpen(false)} title="渠道商分账规则" size="lg" closeOnBackdrop={false}>
            {isInherited && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {"\u5f53\u524d\u5ba2\u6237\u5df2\u914d\u7f6e\u5ba2\u6237\u7ea7\u5206\u8d26\u89c4\u5219\uff0c\u672c\u5408\u540c\u7ee7\u627f\u8be5\u89c4\u5219\uff1b\u5ba2\u6237\u7ea7\u89c4\u5219\u4f18\u5148\uff0c\u4e0d\u80fd\u5728\u5408\u540c\u9875\u9762\u8986\u76d6\u3002"}
              </div>
            )}
            {/* Rule type switch */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRuleType("A")}
                className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  ruleType === "A" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <p className="font-semibold">A 基础分账规则</p>
                <p className="mt-0.5 text-[11px] text-slate-500">按每个服务月的 Thraive 实际到账佣金判断比例</p>
              </button>
              <button
                type="button"
                onClick={() => setRuleType("B")}
                className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  ruleType === "B" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <p className="font-semibold flex items-center gap-1">B 特殊分账规则 <Sparkles className="h-3 w-3" /></p>
                <p className="mt-0.5 text-[11px] text-slate-500">阶梯佣金（按累计 GMV 分段）</p>
              </button>
            </div>

            <div className="space-y-4">
              {/* Common: end date + fixed fee rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">分账截止日期 <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    className="input"
                    value={splitEndDate}
                    onChange={(e) => setSplitEndDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">固费分账比例 <span className="text-rose-500">*</span></label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="input flex-1"
                      value={fixedFeePct}
                      onChange={(e) => setFixedFeePct(e.target.value)}
                      placeholder="30"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    {FIXED_PRESETS.map((p) => (
                      <button key={p} type="button" onClick={() => setFixedFeePct(toPct(p))}
                        className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100">
                        {(p * 100).toFixed(0)}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* A: monthly received-commission threshold */}
              {ruleType === "A" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-blue-900">佣金渠道比例</p>
                    <p className="mt-1 text-[11px] leading-5 text-blue-700">
                      每一客户、每一服务月份，按 Thraive 实际到账销售佣金（USD）整档判断，不做累进分段。
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label">佣金到账阈值</label>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-slate-500">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input"
                          value={commissionThreshold}
                          onChange={(e) => setCommissionThreshold(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label">低于阈值</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          className="input"
                          value={commissionBelowPct}
                          onChange={(e) => setCommissionBelowPct(e.target.value)}
                        />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="label">达到或超过阈值</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          className="input"
                          value={commissionAtOrAbovePct}
                          onChange={(e) => setCommissionAtOrAbovePct(e.target.value)}
                        />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-600">
                    当前规则：低于 ${Number(commissionThreshold || 0).toLocaleString()} 按 {commissionBelowPct || "0"}%；
                    达到或超过 ${Number(commissionThreshold || 0).toLocaleString()} 按 {commissionAtOrAbovePct || "0"}%。
                  </p>
                </div>
              )}

              {/* B: tiered brackets */}
              {ruleType === "B" && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="label !mb-0">阶梯佣金分账（累计 GMV 分段）</label>
                    <button type="button" onClick={addTier}
                      className="flex items-center gap-1 rounded bg-brand-50 px-2 py-1 text-xs text-brand-700 hover:bg-brand-100">
                      <Plus className="h-3 w-3" /> 添加一档
                    </button>
                  </div>
                  <p className="mb-2 text-[11px] text-slate-400">
                    例：[0~10万 @15%][10万~50万 @20%][50万+ @25%]，本期 GMV=30万时按个税口径分段计算：0~10万段 15% + 10万~30万段 20%。
                  </p>
                  <div className="space-y-2">
                    {tiers.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-slate-400">GMV 下界</p>
                          <input type="number" min="0" step="1000"
                            className="input !py-1"
                            value={t.gmvMin}
                            onChange={(e) => updateTier(i, { gmvMin: Number(e.target.value) })} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] text-slate-400">GMV 上界（留空=∞）</p>
                          <input type="number" min="0" step="1000"
                            className="input !py-1"
                            value={t.gmvMax ?? ""}
                            onChange={(e) => updateTier(i, { gmvMax: e.target.value === "" ? null : Number(e.target.value) })} />
                        </div>
                        <div className="w-24">
                          <p className="text-[10px] text-slate-400">分账比例</p>
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.01" min="0" max="100"
                              className="input !py-1 flex-1"
                              value={toPct(t.rate)}
                              onChange={(e) => updateTier(i, { rate: fromPct(e.target.value) })} />
                            <span className="text-xs text-slate-500">%</span>
                          </div>
                        </div>
                        <button type="button" onClick={() => removeTier(i)}
                          className="self-end rounded p-1.5 text-rose-500 hover:bg-rose-50"
                          disabled={tiers.length <= 1}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <div>
                {existing && isAdmin && !isInherited && (
                  <button type="button" onClick={remove} disabled={pending}
                    className="text-sm text-rose-600 hover:underline disabled:opacity-50">
                    删除规则
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">
                  取消
                </button>
                <button type="button" onClick={submit} disabled={pending || isInherited}
                  className="btn-primary flex items-center gap-1 text-sm">
                  <Save className="h-4 w-4" /> {pending ? "保存中…" : existing ? "更新规则" : "保存规则"}
                </button>
              </div>
            </div>
        </Modal>
      )}
    </>
  );
}
