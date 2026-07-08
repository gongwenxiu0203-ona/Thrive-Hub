"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Trash2, AlertTriangle } from "lucide-react";
import { setProjectGmvTarget, type ChannelInput } from "@/actions/projectGmvTarget";
import { CURRENCY_OPTIONS, CURRENCY_SYMBOLS, type Currency } from "@/lib/projectChannels";

export interface UserOption { id: string; name: string }

export interface GmvTargetEditModalProps {
  projectId: string;
  initialMonth: string;
  initialAmOwnerId: string | null;
  initialCurrency: Currency;
  initialMonthlyTarget: number;
  initialRemark: string | null;
  initialChannels: ChannelInput[];
  users: UserOption[];
  onClose: () => void;
}

export function GmvTargetEditModal({
  projectId,
  initialMonth,
  initialAmOwnerId,
  initialCurrency,
  initialMonthlyTarget,
  initialRemark,
  initialChannels,
  users,
  onClose,
}: GmvTargetEditModalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState(initialMonth);
  const [amOwnerId, setAmOwnerId] = useState<string>(initialAmOwnerId ?? "");
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [monthlyTarget, setMonthlyTarget] = useState<number>(initialMonthlyTarget);
  const [remark, setRemark] = useState<string>(initialRemark ?? "");
  const [channels, setChannels] = useState<ChannelInput[]>(initialChannels);

  const sumShare = channels.reduce((acc, c) => acc + (c.sharePercent || 0), 0);
  const sumChannelGmv = channels.reduce(
    (acc, c) => acc + monthlyTarget * (c.sharePercent || 0) / 100, 0
  );
  const diff = monthlyTarget - sumChannelGmv;
  const sumOver100 = sumShare > 100;
  const thresholdAt80 = monthlyTarget * 0.8;
  const sym = CURRENCY_SYMBOLS[currency];

  function updateChannel(idx: number, patch: Partial<ChannelInput>) {
    setChannels((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function addChannel() {
    setChannels((prev) => [
      ...prev,
      {
        channelName: "",
        ownerId: null,
        role: "PGM",
        currency,
        sharePercent: 0,
        sortOrder: prev.length,
      },
    ]);
  }
  function removeChannel(idx: number) {
    setChannels((prev) => prev.filter((_, i) => i !== idx));
  }

  // 切换主货币：所有渠道同步货币
  function changeCurrency(c: Currency) {
    setCurrency(c);
    setChannels((prev) => prev.map((ch) => ({ ...ch, currency: c })));
  }

  function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}$/.test(month)) { setError("月份格式必须是 YYYY-MM"); return; }
    if (monthlyTarget < 0) { setError("月度 GMV 目标不能为负数"); return; }
    startTransition(async () => {
      const r = await setProjectGmvTarget({
        projectId,
        month,
        amOwnerId: amOwnerId || null,
        amRole: "AM",
        currency,
        monthlyTarget,
        remark: remark.trim() || null,
        channels: channels.map((c, idx) => ({
          ...c,
          channelName: c.channelName.trim() || `渠道${idx + 1}`,
          sortOrder: idx,
        })),
      });
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">设置项目 GMV 目标</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="月份" required>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Strategy AM">
            <select
              value={amOwnerId}
              onChange={(e) => setAmOwnerId(e.target.value)}
              className="input"
            >
              <option value="">未指定（默认项目 Strategy AM）</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </Field>
          <Field label="货币">
            <select
              value={currency}
              onChange={(e) => changeCurrency(e.target.value as Currency)}
              className="input"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c} ({CURRENCY_SYMBOLS[c]})</option>
              ))}
            </select>
          </Field>
          <Field label="月度 GMV 目标" required>
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-slate-500">{sym}</span>
              <input
                type="number"
                min={0}
                value={monthlyTarget === 0 ? "" : monthlyTarget}
                onChange={(e) => setMonthlyTarget(Number(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className="input"
              />
            </div>
          </Field>
        </div>

        {/* 汇总三件套：80% 达标线 / 渠道目标合计 / 差值 */}
        <div className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
          <Stat label="80% 达标线" value={`${sym}${thresholdAt80.toLocaleString()}`} />
          <Stat label="渠道目标合计" value={`${sym}${sumChannelGmv.toLocaleString()} (${sumShare.toFixed(1)}%)`} color={sumOver100 ? "text-rose-600" : undefined} />
          <Stat label="与项目目标差值" value={`${sym}${diff.toLocaleString()}`} color={diff < 0 ? "text-rose-600" : "text-slate-600"} />
        </div>
        {sumOver100 && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>渠道占比合计 {sumShare.toFixed(1)}% 已超 100%，可保存但请核对是否符合预期。</p>
          </div>
        )}

        {/* 渠道目标表格 */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">渠道目标</p>
            <button type="button" onClick={addChannel} className="btn-secondary flex items-center gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> 添加渠道
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left">渠道</th>
                  <th className="px-2 py-2 text-left">人员</th>
                  <th className="px-2 py-2 text-left">角色</th>
                  <th className="px-2 py-2 text-right">占比 %</th>
                  <th className="px-2 py-2 text-right">渠道 GMV</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={c.channelName}
                        onChange={(e) => updateChannel(idx, { channelName: e.target.value })}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={c.ownerId ?? ""}
                        onChange={(e) => updateChannel(idx, { ownerId: e.target.value || null })}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      >
                        <option value="">未指定</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={c.role ?? "PGM"}
                        onChange={(e) => updateChannel(idx, { role: e.target.value })}
                        className="w-20 rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        step={0.1}
                        value={c.sharePercent === 0 ? "" : c.sharePercent}
                        onChange={(e) => updateChannel(idx, { sharePercent: Number(e.target.value) || 0 })}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-600">
                      {sym}{(monthlyTarget * (c.sharePercent || 0) / 100).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" onClick={() => removeChannel(idx)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {channels.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-4 text-center text-xs text-slate-400">无渠道，点击右上「添加渠道」</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Field label="备注（可选）" className="mt-4">
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={2}
            className="input"
          />
        </Field>

        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">{error}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">取消</button>
          <button type="button" onClick={submit} disabled={pending} className="btn-primary text-sm">
            {pending ? "保存中…" : "保存目标"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, className, children }: {
  label: string; required?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${color ?? "text-slate-700"}`}>{value}</p>
    </div>
  );
}
