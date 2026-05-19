"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import {
  AFFILIATE_SOURCE_OPTIONS,
  AFFILIATE_CATEGORY_OPTIONS,
  AFFILIATE_TYPE_OPTIONS,
  AFFILIATE_TAG_OPTIONS,
  WEBSITE_PLACEMENT_OPTIONS,
  INS_PLACEMENT_OPTIONS,
  FB_PLACEMENT_OPTIONS,
  YT_PLACEMENT_OPTIONS,
  TIKTOK_PLACEMENT_OPTIONS,
  TOP_CREATOR_OPTIONS,
  AFFILIATE_DEV_STATUS_OPTIONS,
  COOPERATION_MODE_OPTIONS,
  SAMPLE_SHIPPING_OPTIONS,
} from "@/lib/constants";
import { type PlacementEntry } from "@/lib/affiliateFields";

interface BrandEntry {
  customerId: string | null;
  brandName: string;
  developmentStatus: string;
  personInChargeId: string;
  contactEmail: string;
}

interface Props {
  users: { id: string; name: string }[];
  customers: { id: string; brandName: string }[];
  currentUserId: string;
  affiliate?: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function parseArr(v: unknown): string[] {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  if (Array.isArray(v)) return v;
  return [];
}
function parsePlacements(v: unknown): PlacementEntry[] {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  if (Array.isArray(v)) return v;
  return [];
}
function parseBrandEntries(v: unknown, fallback: BrandEntry): BrandEntry[] {
  if (typeof v === "string" && v !== "[]") {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch { /* ignore */ }
  }
  return [fallback];
}

export default function AffiliateFormModal({ users, customers, currentUserId, affiliate, onClose, onSaved }: Props) {
  const isEdit = !!affiliate?.id;

  const [tags, setTags] = useState<string[]>(parseArr(affiliate?.tags));
  const [modes, setModes] = useState<string[]>(parseArr(affiliate?.cooperationMode));
  const [websitePlacements, setWebsitePlacements] = useState<PlacementEntry[]>(parsePlacements(affiliate?.websitePlacements));
  const [instagramPlacements, setInstagramPlacements] = useState<PlacementEntry[]>(parsePlacements(affiliate?.instagramPlacements));
  const [facebookPlacements, setFacebookPlacements] = useState<PlacementEntry[]>(parsePlacements(affiliate?.facebookPlacements));
  const [youtubePlacements, setYoutubePlacements] = useState<PlacementEntry[]>(parsePlacements(affiliate?.youtubePlacements));
  const [tiktokPlacements, setTiktokPlacements] = useState<PlacementEntry[]>(parsePlacements(affiliate?.tiktokPlacements));

  // Multi-brand entries — migrate legacy single-brand fields if brandEntries is empty
  const [brandEntries, setBrandEntries] = useState<BrandEntry[]>(() =>
    parseBrandEntries(affiliate?.brandEntries, {
      customerId: null,
      brandName: str(affiliate?.brand),
      developmentStatus: str(affiliate?.developmentStatus),
      personInChargeId: isEdit ? str(affiliate?.personInChargeId) : currentUserId,
      contactEmail: str(affiliate?.contactEmail),
    })
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => { body[k] = v; });
    body.tags = JSON.stringify(tags);
    body.cooperationMode = JSON.stringify(modes);
    body.websitePlacements = JSON.stringify(websitePlacements);
    body.instagramPlacements = JSON.stringify(instagramPlacements);
    body.facebookPlacements = JSON.stringify(facebookPlacements);
    body.youtubePlacements = JSON.stringify(youtubePlacements);
    body.tiktokPlacements = JSON.stringify(tiktokPlacements);
    body.brandEntries = JSON.stringify(brandEntries);
    // Mirror primary personInChargeId from first brand entry for filtering/relation
    body.personInChargeId = brandEntries[0]?.personInChargeId || null;

    try {
      const url = isEdit ? `/api/affiliates/${affiliate.id}` : "/api/affiliates";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!affiliate?.id || !confirm("确认删除该联盟商？")) return;
    const res = await fetch(`/api/affiliates/${affiliate.id}`, { method: "DELETE" });
    if (res.ok) onSaved();
  }

  // Brand entry helpers
  function addBrandEntry() {
    setBrandEntries(prev => [...prev, {
      customerId: null, brandName: "", developmentStatus: "", personInChargeId: "", contactEmail: "",
    }]);
  }
  function removeBrandEntry(i: number) {
    setBrandEntries(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateBrandEntry(i: number, key: keyof BrandEntry, val: string | null) {
    setBrandEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [key]: val } : e));
  }
  function onCustomerSelect(i: number, customerId: string) {
    const c = customers.find(c => c.id === customerId);
    setBrandEntries(prev => prev.map((e, idx) => idx === i
      ? { ...e, customerId: customerId || null, brandName: c?.brandName ?? e.brandName }
      : e
    ));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8">
      <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold text-slate-900">{isEdit ? "编辑联盟商" : "新增联盟商"}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-6" data-aff="1">
          {/* 核心信息 */}
          <Section title="核心信息">
            <Row2>
              <Field label="平台联盟商名称 Affiliate Name on Network *">
                <input name="platformAffiliateName" required className="input" defaultValue={str(affiliate?.platformAffiliateName)} />
              </Field>
              <Field label="内部联盟商名称 Internal Affiliate Name">
                <input name="internalAffiliateName" className="input" defaultValue={str(affiliate?.internalAffiliateName)} />
              </Field>
              <Field label="联盟商来源">
                <SelectOpt name="source" options={AFFILIATE_SOURCE_OPTIONS} defaultValue={str(affiliate?.source)} />
              </Field>
              <Field label="一级类目">
                <SelectOpt name="category" options={AFFILIATE_CATEGORY_OPTIONS} defaultValue={str(affiliate?.category)} />
              </Field>
            </Row2>
            <Field label="联盟商类型 Type">
              <SelectOpt name="affiliateType" options={AFFILIATE_TYPE_OPTIONS} defaultValue={str(affiliate?.affiliateType)} />
            </Field>
            <Field label="联盟商标签 (多选)">
              <MultiCheck options={AFFILIATE_TAG_OPTIONS} selected={tags} onChange={setTags} />
            </Field>
          </Section>

          {/* Website */}
          <Section title="Website">
            <Row2>
              <Field label="Website link"><input name="websiteLink" className="input" type="url" placeholder="https://" defaultValue={str(affiliate?.websiteLink)} /></Field>
              <Field label="【单位K】月流量Monthly Traffic"><input name="websiteTraffic" className="input" type="number" step="0.1" defaultValue={str(affiliate?.websiteTraffic)} /></Field>
              <Field label="website备注"><input name="websiteNote" className="input" defaultValue={str(affiliate?.websiteNote)} /></Field>
            </Row2>
            <Field label="Website版位 + Flatfee (可多条)">
              <PlacementsEditor placements={websitePlacements} onChange={setWebsitePlacements} options={WEBSITE_PLACEMENT_OPTIONS} />
            </Field>
          </Section>

          {/* Instagram */}
          <Section title="Instagram">
            <Row2>
              <Field label="Instagram link"><input name="instagramLink" className="input" type="url" placeholder="https://" defaultValue={str(affiliate?.instagramLink)} /></Field>
              <Field label="【单位K】INS粉丝数 Followers"><input name="insFollowers" className="input" type="number" step="0.1" defaultValue={str(affiliate?.insFollowers)} /></Field>
              <Field label="INS备注"><input name="insNote" className="input" defaultValue={str(affiliate?.insNote)} /></Field>
            </Row2>
            <Field label="INS版位 + Instagram Flatfee (可多条)">
              <PlacementsEditor placements={instagramPlacements} onChange={setInstagramPlacements} options={INS_PLACEMENT_OPTIONS} />
            </Field>
          </Section>

          {/* Facebook */}
          <Section title="Facebook">
            <Row2>
              <Field label="Facebook link"><input name="facebookLink" className="input" type="url" placeholder="https://" defaultValue={str(affiliate?.facebookLink)} /></Field>
              <Field label="【单位K】FB粉丝数 Followers"><input name="fbFollowers" className="input" type="number" step="0.1" defaultValue={str(affiliate?.fbFollowers)} /></Field>
              <Field label="FB备注"><input name="fbNote" className="input" defaultValue={str(affiliate?.fbNote)} /></Field>
            </Row2>
            <Field label="Facebook版位 + Facebook Flatfee (可多条)">
              <PlacementsEditor placements={facebookPlacements} onChange={setFacebookPlacements} options={FB_PLACEMENT_OPTIONS} />
            </Field>
          </Section>

          {/* YouTube */}
          <Section title="YouTube">
            <Row2>
              <Field label="YouTube link"><input name="youtubeLink" className="input" type="url" placeholder="https://" defaultValue={str(affiliate?.youtubeLink)} /></Field>
              <Field label="【单位K】YouTube粉丝数 Followers"><input name="youtubeFollowers" className="input" type="number" step="0.1" defaultValue={str(affiliate?.youtubeFollowers)} /></Field>
            </Row2>
            <Field label="YouTube版位 + YouTube Flatfee (可多条)">
              <PlacementsEditor placements={youtubePlacements} onChange={setYoutubePlacements} options={YT_PLACEMENT_OPTIONS} />
            </Field>
          </Section>

          {/* TikTok */}
          <Section title="TikTok">
            <Row2>
              <Field label="TikTok link"><input name="tiktokLink" className="input" type="url" placeholder="https://" defaultValue={str(affiliate?.tiktokLink)} /></Field>
              <Field label="【单位K】TikTok粉丝数 Followers"><input name="tiktokFollowers" className="input" type="number" step="0.1" defaultValue={str(affiliate?.tiktokFollowers)} /></Field>
            </Row2>
            <Field label="TikTok版位 + TikTok Flatfee (可多条)">
              <PlacementsEditor placements={tiktokPlacements} onChange={setTiktokPlacements} options={TIKTOK_PLACEMENT_OPTIONS} />
            </Field>
          </Section>

          {/* Amazon Storefront */}
          <Section title="Amazon Storefront">
            <Row2>
              <Field label="Amazon storefront link"><input name="amazonStorefrontLink" className="input" type="url" placeholder="https://" defaultValue={str(affiliate?.amazonStorefrontLink)} /></Field>
              <Field label="Top Creator">
                <SelectOpt name="topCreator" options={TOP_CREATOR_OPTIONS} defaultValue={str(affiliate?.topCreator)} />
              </Field>
              <Field label="Storefront flatfee"><input name="storefrontFlatfee" className="input" type="number" step="0.01" placeholder="$" defaultValue={str(affiliate?.storefrontFlatfee)} /></Field>
              <Field label="Storefront备注"><input name="storefrontNote" className="input" defaultValue={str(affiliate?.storefrontNote)} /></Field>
            </Row2>
          </Section>

          {/* LTK + Pinterest */}
          <Section title="LTK / Pinterest">
            <Row2>
              <Field label="LTK link"><input name="ltkLink" className="input" type="url" placeholder="https://" defaultValue={str(affiliate?.ltkLink)} /></Field>
              <Field label="LTK flatfee"><input name="ltkFlatfee" className="input" type="number" step="0.01" placeholder="$" defaultValue={str(affiliate?.ltkFlatfee)} /></Field>
              <Field label="Pinterest link"><input name="pinterestLink" className="input" type="url" placeholder="https://" defaultValue={str(affiliate?.pinterestLink)} /></Field>
              <Field label="Pinterest flatfee"><input name="pinterestFlatfee" className="input" type="number" step="0.01" placeholder="$" defaultValue={str(affiliate?.pinterestFlatfee)} /></Field>
            </Row2>
          </Section>

          {/* 其他 */}
          <Section title="其他信息">
            <Row2>
              <Field label="Flatfee合作费用 【补充】"><input name="flatfeeSupplementary" className="input" defaultValue={str(affiliate?.flatfeeSupplementary)} /></Field>
              <Field label="联系方式 contact information"><input name="contactInfo" className="input" defaultValue={str(affiliate?.contactInfo)} /></Field>
            </Row2>
            <Field label="备注"><textarea name="note" className="input min-h-[64px]" defaultValue={str(affiliate?.note)} /></Field>
          </Section>

          {/* 开发管理 */}
          <Section title="开发管理">
            <Row2>
              <Field label="样品寄送">
                <SelectOpt name="sampleShipping" options={SAMPLE_SHIPPING_OPTIONS} defaultValue={str(affiliate?.sampleShipping)} />
              </Field>
            </Row2>
            <Field label="开发情况描述"><textarea name="developmentDesc" className="input min-h-[64px]" defaultValue={str(affiliate?.developmentDesc)} /></Field>
            <Field label="合作模式 (多选)">
              <MultiCheck options={COOPERATION_MODE_OPTIONS} selected={modes} onChange={setModes} />
            </Field>

            {/* Multi-brand entries */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">关联品牌 / 开发记录</label>
                <button type="button" onClick={addBrandEntry} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
                  <Plus className="h-3.5 w-3.5" />新增品牌
                </button>
              </div>
              <div className="space-y-3">
                {brandEntries.map((entry, i) => (
                  <BrandEntryRow
                    key={i}
                    entry={entry}
                    index={i}
                    users={users}
                    customers={customers}
                    canDelete={brandEntries.length > 1}
                    onCustomerSelect={(customerId) => onCustomerSelect(i, customerId)}
                    onChange={(key, val) => updateBrandEntry(i, key, val)}
                    onDelete={() => removeBrandEntry(i)}
                  />
                ))}
              </div>
            </div>
          </Section>

          {error && <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        </form>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <div>
            {isEdit && (
              <button type="button" onClick={handleDelete} className="text-sm text-rose-600 hover:text-rose-700">删除</button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline text-sm">取消</button>
            <button type="button" onClick={() => {
              document.querySelector<HTMLFormElement>("form[data-aff]")?.requestSubmit();
            }} className="btn-primary text-sm" disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Brand Entry Row ──────────────────────────────────────────────────────────

function BrandEntryRow({ entry, index, users, customers, canDelete, onCustomerSelect, onChange, onDelete }: {
  entry: BrandEntry;
  index: number;
  users: { id: string; name: string }[];
  customers: { id: string; brandName: string }[];
  canDelete: boolean;
  onCustomerSelect: (customerId: string) => void;
  onChange: (key: keyof BrandEntry, val: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 grid gap-2 sm:grid-cols-2">
          {/* Customer / brand select */}
          <div>
            <label className="mb-1 block text-[10px] text-slate-400">关联客户品牌 {index === 0 && <span className="text-brand-500">(主)</span>}</label>
            <select
              className="input text-sm"
              value={entry.customerId ?? ""}
              onChange={e => onCustomerSelect(e.target.value)}
            >
              <option value="">— 不关联客户 —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.brandName}</option>)}
            </select>
          </div>
          {/* Brand name (editable, auto-filled from customer) */}
          <div>
            <label className="mb-1 block text-[10px] text-slate-400">品牌名称</label>
            <input
              className="input text-sm"
              placeholder="品牌 / 店铺名称"
              value={entry.brandName}
              onChange={e => onChange("brandName", e.target.value)}
            />
          </div>
          {/* Development status */}
          <div>
            <label className="mb-1 block text-[10px] text-slate-400">开发状态</label>
            <select
              className="input text-sm"
              value={entry.developmentStatus}
              onChange={e => onChange("developmentStatus", e.target.value)}
            >
              <option value="">— 请选择 —</option>
              {AFFILIATE_DEV_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {/* Person in charge */}
          <div>
            <label className="mb-1 block text-[10px] text-slate-400">负责人</label>
            <select
              className="input text-sm"
              value={entry.personInChargeId}
              onChange={e => onChange("personInChargeId", e.target.value)}
            >
              <option value="">未分配</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {/* Contact email */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[10px] text-slate-400">负责人建联邮箱</label>
            <input
              className="input text-sm"
              type="email"
              placeholder="email@example.com"
              value={entry.contactEmail}
              onChange={e => onChange("contactEmail", e.target.value)}
            />
          </div>
        </div>
        {canDelete && (
          <button type="button" onClick={onDelete} className="mt-5 shrink-0 text-slate-300 hover:text-rose-500">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 border-l-2 border-brand-500 pl-2 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function SelectOpt({ name, options, defaultValue }: { name: string; options: readonly string[]; defaultValue?: string }) {
  return (
    <select name={name} className="input" defaultValue={defaultValue ?? ""}>
      <option value="">— 请选择 —</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function MultiCheck({ options, selected, onChange }: {
  options: readonly string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(o: string) {
    onChange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => toggle(o)}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${selected.includes(o) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-brand-300"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function PlacementsEditor({ placements, onChange, options }: {
  placements: PlacementEntry[];
  onChange: (v: PlacementEntry[]) => void;
  options: readonly string[];
}) {
  function addRow() { onChange([...placements, { placement: "", flatfee: null }]); }
  function removeRow(i: number) { onChange(placements.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, key: keyof PlacementEntry, val: string | number | null) {
    const next = [...placements];
    next[i] = { ...next[i], [key]: val };
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {placements.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            className="input flex-1"
            value={p.placement}
            onChange={(e) => updateRow(i, "placement", e.target.value)}
          >
            <option value="">— 选择版位 —</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <div className="relative flex-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
            <input
              type="number"
              step="0.01"
              placeholder="Flatfee"
              className="input pl-5"
              value={p.flatfee ?? ""}
              onChange={(e) => updateRow(i, "flatfee", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <button type="button" onClick={() => removeRow(i)} className="text-slate-400 hover:text-rose-500">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
        <Plus className="h-3.5 w-3.5" />添加版位
      </button>
    </div>
  );
}
