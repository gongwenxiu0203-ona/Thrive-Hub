"use client";

import { useState, useMemo } from "react";
import { X, Plus, Trash2, BarChart2, CheckCircle2 } from "lucide-react";
import { AFFILIATE_COOP_STATUS_OPTIONS, COOPERATION_MODE_OPTIONS } from "@/lib/constants";
import type { SaleRec } from "./AffiliateSalesPanel";

const CURRENCY_OPTIONS = ["USD ($)", "RMB (¥)", "EUR (€)", "GBP (£)"];

interface PlacementItem {
  name: string;
  currency: string;
  flatfee: string;
}

interface PlatformEntry {
  platform: string;
  link: string;
  decision: "通过" | "驳回" | "";
  placements: PlacementItem[];
}

interface Props {
  affiliateId: string;
  affiliateName: string;
  customers: { id: string; brandName: string; ownerIds: string[] }[];
  users: { id: string; name: string }[];
  affiliatePlatforms: { name: string; link: string | null }[];
  salesData: SaleRec[];
  onClose: () => void;
  onSaved: () => void;
}

function emptyPlatform(): PlatformEntry {
  return { platform: "", link: "", decision: "", placements: [{ name: "", currency: "USD ($)", flatfee: "" }] };
}

export default function CoopReviewModal({
  affiliateId, affiliateName, customers, users,
  affiliatePlatforms, salesData,
  onClose, onSaved,
}: Props) {
  const [customerId, setCustomerId] = useState("");
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [coopModes, setCoopModes] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<PlatformEntry[]>([emptyPlatform()]);

  // Sample shipping review
  const [sampleShipping, setSampleShipping] = useState("");
  const [sampleShippingNote, setSampleShippingNote] = useState("");
  const [sampleShippingDecision, setSampleShippingDecision] = useState<"通过" | "驳回" | "">("");

  const [blurBrands, setBlurBrands] = useState(false);
  const [notes, setNotes] = useState("");
  const [customerStatus, setCustomerStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Historical data state
  const [showHistData, setShowHistData] = useState(false);
  const [histBrand, setHistBrand] = useState("");
  const [histProgram, setHistProgram] = useState("");
  const [showRevenue, setShowRevenue] = useState(true);
  const [showUnits, setShowUnits] = useState(true);
  const [showRate, setShowRate] = useState(true);

  const allBrands = useMemo(() => [...new Set(salesData.map(r => r.brand).filter(Boolean))].sort(), [salesData]);
  const allPrograms = useMemo(() => [...new Set(salesData.map(r => r.affiliateProgram).filter((x): x is string => !!x))].sort(), [salesData]);

  const histFiltered = useMemo(() => salesData.filter(r => {
    if (histBrand && r.brand !== histBrand) return false;
    if (histProgram && r.affiliateProgram !== histProgram) return false;
    return true;
  }), [salesData, histBrand, histProgram]);

  const histRevenue = useMemo(() => histFiltered.reduce((s, r) => s + r.revenue, 0), [histFiltered]);
  const histUnits = useMemo(() => histFiltered.reduce((s, r) => s + r.unitsSold, 0), [histFiltered]);
  const histRate = useMemo(() => {
    if (histRevenue === 0) return 0;
    return histFiltered.reduce((s, r) => s + r.commissionRate * r.revenue, 0) / histRevenue * 100;
  }, [histFiltered, histRevenue]);

  const selectedCustomer = customers.find(c => c.id === customerId);

  function onCustomerChange(id: string) {
    setCustomerId(id);
    const c = customers.find(x => x.id === id);
    if (c && c.ownerIds.length > 0) setReviewerIds(c.ownerIds);
    else setReviewerIds([]);
  }

  function toggleMode(mode: string) {
    setCoopModes(prev => prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]);
  }

  function toggleReviewer(uid: string) {
    setReviewerIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]);
  }

  // Platform helpers
  function addPlatform() {
    setPlatforms(prev => [...prev, emptyPlatform()]);
  }
  function removePlatform(i: number) {
    setPlatforms(prev => prev.filter((_, idx) => idx !== i));
  }
  function onPlatformSelect(i: number, platformName: string) {
    const existing = affiliatePlatforms.find(p => p.name === platformName);
    setPlatforms(prev => prev.map((p, idx) => idx === i
      ? { ...p, platform: platformName, link: existing?.link ?? "" }
      : p
    ));
  }
  function updatePlatformField(i: number, key: "link" | "decision", val: string) {
    setPlatforms(prev => prev.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
  }

  // Placement helpers
  function addPlacement(pi: number) {
    setPlatforms(prev => prev.map((p, idx) => idx === pi
      ? { ...p, placements: [...p.placements, { name: "", currency: "USD ($)", flatfee: "" }] }
      : p
    ));
  }
  function removePlacement(pi: number, li: number) {
    setPlatforms(prev => prev.map((p, idx) => idx === pi
      ? { ...p, placements: p.placements.filter((_, i) => i !== li) }
      : p
    ));
  }
  function updatePlacement(pi: number, li: number, key: keyof PlacementItem, val: string) {
    setPlatforms(prev => prev.map((p, idx) => idx === pi
      ? { ...p, placements: p.placements.map((pl, i) => i === li ? { ...pl, [key]: val } : pl) }
      : p
    ));
  }

  // One-click approve all
  function approveAll() {
    setPlatforms(prev => prev.map(p => ({ ...p, decision: "通过" as const })));
    setSampleShippingDecision("通过");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Build structured notes
    const platformLines = platforms
      .filter(p => p.platform)
      .map(p => {
        const decisionStr = p.decision ? ` [${p.decision}]` : "";
        const linkStr = p.link ? ` (${p.link})` : "";
        const placements = p.placements.filter(pl => pl.name || pl.flatfee).map(pl => {
          const fee = pl.flatfee ? ` · ${pl.currency.split(" ")[1]}${pl.flatfee}` : "";
          return `    - ${pl.name || "版位"}${fee}`;
        }).join("\n");
        return `${p.platform}${linkStr}${decisionStr}${placements ? "\n" + placements : ""}`;
      }).join("\n");

    const sampleLine = sampleShipping
      ? `样品寄送: ${sampleShipping}${sampleShippingDecision ? ` [${sampleShippingDecision}]` : ""}${sampleShippingNote ? ` — ${sampleShippingNote}` : ""}`
      : "";

    const fullNotes = [
      coopModes.length ? `合作模式: ${coopModes.join(", ")}` : "",
      platformLines ? `预合作平台:\n${platformLines}` : "",
      sampleLine,
      notes,
    ].filter(Boolean).join("\n\n");

    const primaryPlatform = platforms.filter(p => p.platform).map(p => p.platform).join(", ");
    const primaryFee = platforms.flatMap(p => p.placements).find(pl => pl.flatfee)?.flatfee;

    try {
      const res = await fetch(`/api/affiliates/${affiliateId}/coop-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerId || null,
          customerName: selectedCustomer?.brandName ?? null,
          platform: primaryPlatform || null,
          fee: primaryFee ? Number(primaryFee) : null,
          blurBrands,
          notes: fullNotes,
          customerStatus: customerStatus || null,
          reviewerIds,
          // Structured data for auto-creating reconciliation records
          platforms: platforms.filter(p => p.platform),
          coopModes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">合作审核</h2>
            <p className="text-xs text-slate-500">{affiliateName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {/* 关联客户 */}
          <div>
            <label className="label text-xs">关联客户</label>
            <select className="input" value={customerId} onChange={e => onCustomerChange(e.target.value)}>
              <option value="">— 不关联客户 —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.brandName}</option>)}
            </select>
          </div>

          {/* 审核人 */}
          <div>
            <label className="label text-xs">
              审核人（可多选）
              {selectedCustomer && selectedCustomer.ownerIds.length > 0 && (
                <span className="ml-2 text-[10px] text-brand-500">已自动勾选该客户负责人</span>
              )}
            </label>
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              {users.map(u => (
                <label key={u.id} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm hover:border-brand-300">
                  <input type="checkbox" className="rounded border-slate-300" checked={reviewerIds.includes(u.id)} onChange={() => toggleReviewer(u.id)} />
                  {u.name}
                </label>
              ))}
            </div>
          </div>

          {/* 合作模式 */}
          <div>
            <label className="label text-xs">合作模式（可多选）</label>
            <div className="flex flex-wrap gap-2">
              {COOPERATION_MODE_OPTIONS.map(mode => (
                <button key={mode} type="button" onClick={() => toggleMode(mode)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${coopModes.includes(mode) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* 预合作平台 — only affiliate's existing platforms */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0 text-xs">预合作平台</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={approveAll}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />一键全部通过
                </button>
                <button type="button" onClick={addPlatform} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
                  <Plus className="h-3.5 w-3.5" />新增平台
                </button>
              </div>
            </div>

            {affiliatePlatforms.length === 0 && (
              <p className="text-xs text-slate-400 mb-2">该联盟商暂无已记录的社媒平台，请先在编辑页面完善社媒信息。</p>
            )}

            <div className="space-y-3">
              {platforms.map((p, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                  {/* Platform header: select + link + decision + delete */}
                  <div className="flex items-center gap-2">
                    <select
                      className="input flex-1 text-sm"
                      value={p.platform}
                      onChange={e => onPlatformSelect(i, e.target.value)}
                    >
                      <option value="">选择平台</option>
                      {affiliatePlatforms.map(opt => (
                        <option key={opt.name} value={opt.name}>✓ {opt.name}</option>
                      ))}
                    </select>
                    {/* Decision toggle */}
                    <button
                      type="button"
                      onClick={() => updatePlatformField(i, "decision", p.decision === "通过" ? "" : "通过")}
                      className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${p.decision === "通过" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600"}`}
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePlatformField(i, "decision", p.decision === "驳回" ? "" : "驳回")}
                      className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${p.decision === "驳回" ? "border-rose-400 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-600"}`}
                    >
                      驳回
                    </button>
                    {platforms.length > 1 && (
                      <button type="button" onClick={() => removePlatform(i)} className="shrink-0 text-slate-400 hover:text-rose-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Platform link */}
                  <div>
                    <label className="mb-1 block text-[10px] text-slate-400">
                      平台链接{p.platform && affiliatePlatforms.find(ap => ap.name === p.platform)?.link ? " (已自动填入)" : "（可选）"}
                    </label>
                    <input
                      className="input text-xs"
                      placeholder="https://..."
                      value={p.link}
                      onChange={e => updatePlatformField(i, "link", e.target.value)}
                    />
                  </div>

                  {/* Placements */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-[10px] text-slate-400">版位 / Flatfee（可多条）</label>
                      <button type="button" onClick={() => addPlacement(i)} className="flex items-center gap-0.5 text-[10px] text-brand-500 hover:text-brand-700">
                        <Plus className="h-3 w-3" />添加版位
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {p.placements.map((pl, li) => (
                        <div key={li} className="flex items-center gap-1.5">
                          <input
                            className="input flex-1 text-xs"
                            placeholder="版位名称"
                            value={pl.name}
                            onChange={e => updatePlacement(i, li, "name", e.target.value)}
                          />
                          <select
                            className="input w-24 shrink-0 text-xs"
                            value={pl.currency}
                            onChange={e => updatePlacement(i, li, "currency", e.target.value)}
                          >
                            {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input
                            className="input w-24 shrink-0 text-xs"
                            type="number" step="0.01" placeholder="0.00"
                            value={pl.flatfee}
                            onChange={e => updatePlacement(i, li, "flatfee", e.target.value)}
                          />
                          {p.placements.length > 1 && (
                            <button type="button" onClick={() => removePlacement(i, li)} className="shrink-0 text-slate-300 hover:text-rose-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 样品寄送审核 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 space-y-2">
            <label className="text-xs font-medium text-slate-700">样品寄送</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] text-slate-400">寄送要求</label>
                <select className="input text-sm" value={sampleShipping} onChange={e => setSampleShipping(e.target.value)}>
                  <option value="">— 请选择 —</option>
                  <option value="是">是</option>
                  <option value="否">否</option>
                  <option value="均可">均可</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-slate-400">审核决定</label>
                <div className="flex gap-1.5">
                  <button type="button"
                    onClick={() => setSampleShippingDecision(sampleShippingDecision === "通过" ? "" : "通过")}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${sampleShippingDecision === "通过" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400 hover:border-emerald-300"}`}>
                    通过
                  </button>
                  <button type="button"
                    onClick={() => setSampleShippingDecision(sampleShippingDecision === "驳回" ? "" : "驳回")}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${sampleShippingDecision === "驳回" ? "border-rose-400 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-400 hover:border-rose-300"}`}>
                    驳回
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-slate-400">样品说明</label>
              <input className="input text-sm" placeholder="样品寄送说明（可选）" value={sampleShippingNote} onChange={e => setSampleShippingNote(e.target.value)} />
            </div>
          </div>

          {/* 往期数据查询 */}
          {salesData.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/40">
              <button type="button" onClick={() => setShowHistData(!showHistData)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
                <BarChart2 className="h-4 w-4 text-brand-500" />
                <span className="text-sm font-medium text-slate-700">往期合作数据参考</span>
                <span className="ml-auto text-[11px] text-slate-400">{salesData.length} 条记录 {showHistData ? "▲" : "▼"}</span>
              </button>
              {showHistData && (
                <div className="border-t border-slate-200 px-4 pb-4 pt-3 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] text-slate-400">选择品牌</label>
                      <select className="input text-xs" value={histBrand} onChange={e => setHistBrand(e.target.value)}>
                        <option value="">全部品牌</option>
                        {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-slate-400">选择联盟类型/品类</label>
                      <select className="input text-xs" value={histProgram} onChange={e => setHistProgram(e.target.value)}>
                        <option value="">全部类型</option>
                        {allPrograms.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] text-slate-400 shrink-0">展示维度：</span>
                    {[
                      { label: "销售额", state: showRevenue, set: setShowRevenue },
                      { label: "销售数量", state: showUnits, set: setShowUnits },
                      { label: "佣金率占比", state: showRate, set: setShowRate },
                    ].map(({ label, state, set }) => (
                      <label key={label} className="flex cursor-pointer items-center gap-1.5 text-xs">
                        <input type="checkbox" className="rounded border-slate-300" checked={state} onChange={e => set(e.target.checked)} />
                        <span className="text-slate-600">{label}</span>
                      </label>
                    ))}
                    <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs">
                      <input type="checkbox" className="rounded border-slate-300" checked={blurBrands} onChange={e => setBlurBrands(e.target.checked)} />
                      <span className="text-slate-500">模糊品牌名称</span>
                    </label>
                  </div>
                  {histFiltered.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {showRevenue && (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                          <p className="text-[10px] text-slate-400">总销售额</p>
                          <p className="mt-0.5 text-sm font-bold text-brand-700">${histRevenue.toFixed(2)}</p>
                          <p className="text-[10px] text-slate-400">{histFiltered.length} 条订单</p>
                        </div>
                      )}
                      {showUnits && (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                          <p className="text-[10px] text-slate-400">销售数量</p>
                          <p className="mt-0.5 text-sm font-bold text-slate-800">{histFiltered.reduce((s,r) => s + r.unitsSold, 0).toLocaleString()}</p>
                        </div>
                      )}
                      {showRate && (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                          <p className="text-[10px] text-slate-400">实际佣金率</p>
                          <p className="mt-0.5 text-sm font-bold text-emerald-700">{histRate.toFixed(2)}%</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-slate-100 py-3 text-center text-xs text-slate-400">
                      {histBrand || histProgram ? "当前筛选条件下暂无数据" : "请选择品牌或联盟类型查看往期数据"}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 写回合作状态 */}
          {customerId && (
            <div>
              <label className="label text-xs">写回当前客户合作状态</label>
              <select className="input" value={customerStatus} onChange={e => setCustomerStatus(e.target.value)}>
                <option value="">— 不更新状态 —</option>
                {AFFILIATE_COOP_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* 审核备注 */}
          <div>
            <label className="label text-xs">审核备注</label>
            <textarea className="input min-h-[80px]" placeholder="记录本次审核的评估意见…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? "提交中…" : "提交审核"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
