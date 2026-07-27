"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Upload, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/utils";

const PAYMENT_METHODS = ["PayPal", "对公账号", "银行转账"] as const;
const CURRENCY_OPTIONS = ["USD", "RMB", "EUR", "GBP"] as const;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:     { label: "待填付款信息", color: "bg-amber-50 text-amber-700" },
  info_filled: { label: "已填付款信息", color: "bg-blue-50 text-blue-700" },
  paid:        { label: "已付款",       color: "bg-emerald-50 text-emerald-700" },
};

export type AffiliateRec = {
  id: string;
  affiliateName: string;
  customerName: string | null;
  cooperationMode: string;
  platforms: string;
  submitter: { id: string; name: string } | null;
  promotionAsin: string | null;
  paymentMethod: string | null;
  paymentAccountName: string | null;
  paymentAccount: string | null;
  paymentNote: string | null;
  paymentCurrency: string | null;
  paymentAmount: number | null;
  paymentRequestAt: string | Date | null;
  paidAt: string | Date | null;
  transactionNo: string | null;
  proofUrl: string | null;
  status: string;
  createdAt: string | Date;
};

export function AffiliateReconciliationTab({
  records,
  canEdit = true,
}: {
  records: AffiliateRec[];
  canEdit?: boolean;
}) {
  const [selected, setSelected] = useState<AffiliateRec | null>(null);
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">共 {records.length} 条联盟商对账记录</p>
      </div>

      {records.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <p className="text-slate-400">暂无联盟商对账记录</p>
          <p className="mt-1 text-xs text-slate-400">合作审核通过后将自动在此创建记录</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-3 text-left font-medium">平台联盟商名称</th>
                <th className="px-4 py-3 text-left font-medium">关联客户</th>
                <th className="px-4 py-3 text-left font-medium">合作模式</th>
                <th className="px-4 py-3 text-left font-medium">合作平台</th>
                <th className="px-4 py-3 text-left font-medium">付款金额</th>
                <th className="px-4 py-3 text-left font-medium">提交人</th>
                <th className="px-4 py-3 text-left font-medium">状态</th>
                <th className="px-4 py-3 text-left font-medium">付款申请时间</th>
                <th className="px-4 py-3 text-left font-medium">实际付款</th>
                <th className="px-4 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const modes = safeJson(r.cooperationMode, []);
                const plats = safeJson(r.platforms, []) as { platform: string; placements: { name: string; currency: string; flatfee: string | number }[] }[];
                const st = STATUS_LABELS[r.status] ?? { label: r.status, color: "bg-slate-100 text-slate-500" };
                return (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.affiliateName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.customerName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {modes.map((m: string) => (
                          <span key={m} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600">{m}</span>
                        ))}
                        {modes.length === 0 && <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {plats.map(p => p.platform).join("、") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {r.paymentAmount != null
                        ? `${r.paymentCurrency ?? ""} ${r.paymentAmount.toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{r.submitter?.name ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {r.paymentRequestAt ? formatDate(r.paymentRequestAt) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {r.paidAt ? (
                        <span className="text-emerald-600">{formatDate(r.paidAt)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setSelected(r)}
                        disabled={!canEdit}
                        aria-disabled={!canEdit}
                        className="rounded border border-brand-200 px-2.5 py-1 text-xs text-brand-600 hover:bg-brand-50"
                      >
                        {r.status === "pending" ? "填写信息" : "查看/编辑"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <AffiliateRecModal
          rec={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ── Payment info modal ────────────────────────────────────────────────────────
function AffiliateRecModal({
  rec, onClose, onSaved,
}: {
  rec: AffiliateRec;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    promotionAsin:      rec.promotionAsin ?? "",
    paymentMethod:      rec.paymentMethod ?? "",
    paymentAccountName: rec.paymentAccountName ?? "",
    paymentAccount:     rec.paymentAccount ?? "",
    paymentNote:        rec.paymentNote ?? "",
    paymentCurrency:    rec.paymentCurrency ?? "USD",
    paymentAmount:      rec.paymentAmount != null ? String(rec.paymentAmount) : "",
    paymentRequestAt:   rec.paymentRequestAt ? toDateInput(rec.paymentRequestAt) : "",
    paidAt:             rec.paidAt ? toDateInput(rec.paidAt) : "",
    transactionNo:      rec.transactionNo ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [proofUrl, setProofUrl] = useState(rec.proofUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const plats = safeJson(rec.platforms, []) as { platform: string; link: string; placements: { name: string; currency: string; flatfee: string | number }[] }[];

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/affiliate-reconciliations/${rec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          paymentAmount: form.paymentAmount ? Number(form.paymentAmount) : null,
          paymentRequestAt: form.paymentRequestAt || null,
          paidAt: form.paidAt || null,
          proofUrl: proofUrl || null,
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

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/finance/affiliate-reconciliations/${rec.id}/proof`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProofUrl(data.proofUrl);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }

  // Auto-fill payment amount from platform placements if not set
  const autoAmount = (() => {
    let total = 0;
    for (const p of plats) {
      for (const pl of p.placements ?? []) {
        const fee = Number(pl.flatfee);
        if (!isNaN(fee)) total += fee;
      }
    }
    return total > 0 ? total : null;
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title="联盟商对账详情"
      description={`${rec.affiliateName}${rec.customerName ? ` · ${rec.customerName}` : ""}`}
      size="md"
      closeOnBackdrop={!saving && !uploading}
      closeOnEscape={!saving && !uploading}
    >
        <div className="space-y-5">
          {/* 平台信息（只读） */}
          {plats.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-600">通过审核的合作平台</p>
              {plats.map((p, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-xs font-medium text-slate-700">{p.platform}{p.link && (
                    <a href={p.link} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-brand-500 hover:underline">
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}</p>
                  {p.placements?.map((pl, li) => (
                    <div key={li} className="flex items-center gap-2 pl-3 text-[11px] text-slate-500">
                      <span>{pl.name || "版位"}</span>
                      <span>{pl.currency}</span>
                      <span className="font-medium text-slate-700">{pl.flatfee || "—"}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* 推广ASIN */}
          <LabeledField label="推广ASIN">
            <input className="input text-sm" placeholder="手动填写推广ASIN" value={form.promotionAsin}
              onChange={e => set("promotionAsin", e.target.value)} />
          </LabeledField>

          {/* 付款方式 */}
          <LabeledField label="付款方式">
            <SelectField value={form.paymentMethod} onChange={v => set("paymentMethod", v)}
              options={PAYMENT_METHODS} placeholder="请选择付款方式" />
          </LabeledField>

          {/* 账号名称 & 账号 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label="付款账号名称 Payment Account Name">
              <input className="input text-sm" placeholder="账号名称" value={form.paymentAccountName}
                onChange={e => set("paymentAccountName", e.target.value)} />
            </LabeledField>
            <LabeledField label="账号 Account (ID)">
              <input className="input text-sm" placeholder="账号ID" value={form.paymentAccount}
                onChange={e => set("paymentAccount", e.target.value)} />
            </LabeledField>
          </div>

          {/* 付款货币 & 金额 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label="付款货币">
              <SelectField value={form.paymentCurrency} onChange={v => set("paymentCurrency", v)}
                options={CURRENCY_OPTIONS} placeholder="选择货币" />
            </LabeledField>
            <LabeledField label={`付款金额${autoAmount && !form.paymentAmount ? ` (建议: ${autoAmount})` : ""}`}>
              <input className="input text-sm" type="number" step="0.01" placeholder={autoAmount ? String(autoAmount) : "0.00"}
                value={form.paymentAmount} onChange={e => set("paymentAmount", e.target.value)} />
            </LabeledField>
          </div>

          {/* 付款备注 */}
          <LabeledField label="付款备注">
            <input className="input text-sm" placeholder="付款备注（可选）" value={form.paymentNote}
              onChange={e => set("paymentNote", e.target.value)} />
          </LabeledField>

          {/* 付款申请时间 */}
          <LabeledField label="付款申请时间">
            <input className="input text-sm" type="date" value={form.paymentRequestAt}
              onChange={e => set("paymentRequestAt", e.target.value)} />
          </LabeledField>

          {/* 分割线 */}
          <div className="border-t border-dashed border-slate-200 pt-1">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">实际付款记录</p>
          </div>

          {/* 实际付费时间 & 交易订单号 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label="实际付费时间">
              <input className="input text-sm" type="date" value={form.paidAt}
                onChange={e => set("paidAt", e.target.value)} />
            </LabeledField>
            <LabeledField label="交易订单号">
              <input className="input text-sm" placeholder="交易订单号" value={form.transactionNo}
                onChange={e => set("transactionNo", e.target.value)} />
            </LabeledField>
          </div>

          {/* 付款截图 */}
          <LabeledField label="付款截图">
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "上传中…" : "选择文件"}
              </button>
              {proofUrl && (
                <a href={proofUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                  <ExternalLink className="h-3 w-3" />查看截图
                </a>
              )}
            </div>
          </LabeledField>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">取消</button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
    </Modal>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeJson(s: string, fallback: unknown) {
  try { return JSON.parse(s) ?? fallback; } catch { return fallback; }
}

function toDateInput(d: string | Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label text-xs">{label}</label>
      {children}
    </div>
  );
}

function SelectField({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input flex w-full items-center justify-between text-sm"
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>{value || placeholder}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {options.map(o => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${o === value ? "text-brand-600 font-medium" : "text-slate-700"}`}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
