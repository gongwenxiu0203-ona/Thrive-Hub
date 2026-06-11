"use client";

import { useState } from "react";
import { MAIN_SITES, PROMO_PLATFORMS, PROMOTION_GOALS } from "@/lib/constants";
import type { SiteLinks } from "@/lib/customer";

export type CustomerSectionDefaults = {
  brandName?: string;
  mainSites?: string[];
  siteLinks?: SiteLinks;
  competitor?: string | null;
  targetPlatforms?: string[];
  platformGmv?: Record<string, string>;
  amazonAcos?: string | null;
  amazonAcosNote?: string | null;
  socialMediaInfo?: string | null;
  affiliateHistory?: string | null;
  affiliatePlatforms?: string | null;
  promotionGoals?: string[];
  targetGmv?: string | null;
  channelBudget?: string | null;
  affiliateTeam?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

function SectionCard({
  index,
  title,
  accent,
  children,
}: {
  index: string;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border ${accent} p-4`}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white text-xs shadow-sm">
          {index}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function CustomerSectionFields({
  defaults,
  includeContacts = true,
  errors = {},
}: {
  defaults?: CustomerSectionDefaults;
  includeContacts?: boolean;
  errors?: Record<string, string>;
}) {
  const [sites, setSites] = useState<string[]>(defaults?.mainSites ?? []);
  const [platforms, setPlatforms] = useState<string[]>(
    defaults?.targetPlatforms ?? [],
  );
  const siteLinks = defaults?.siteLinks ?? {};
  const platformGmv = defaults?.platformGmv ?? {};
  const goals = defaults?.promotionGoals ?? [];

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    value: string,
  ) => {
    setList(
      list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value],
    );
  };

  return (
    <div className="space-y-4">
      {/* ① 基础信息 */}
      <SectionCard
        index="①"
        title="基础信息"
        accent="border-sky-200 bg-sky-50/60"
      >
        <div className="space-y-3">
          <div>
            <label className="label" data-field="brandName">
              品牌/店铺名称 *
            </label>
            <input
              name="brandName"
              className={`input ${
                errors.brandName ? "border-rose-400 ring-2 ring-rose-100" : ""
              }`}
              required
              defaultValue={defaults?.brandName ?? ""}
              placeholder="如：AuroraTech"
            />
            {errors.brandName && (
              <p className="mt-1 text-xs text-rose-600">{errors.brandName}</p>
            )}
          </div>

          <div>
            <label className="label">主营站点（可多选）</label>
            <div className="flex flex-wrap gap-3">
              {MAIN_SITES.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name={`site_${s}`}
                    className="rounded border-slate-300"
                    checked={sites.includes(s)}
                    onChange={() => toggle(sites, setSites, s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {sites.map((s) => (
            <div
              key={s}
              className="rounded-lg border border-sky-200 bg-white p-3"
            >
              <p className="mb-2 text-xs font-semibold text-sky-700">
                {s} 站点信息
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  name={`siteLink_${s}`}
                  className="input sm:col-span-3"
                  placeholder={`${s} 店铺/产品链接`}
                  type="url"
                  defaultValue={siteLinks[s]?.link ?? ""}
                />
                <input
                  name={`sitePrice_${s}`}
                  className="input"
                  placeholder="客单价（$）"
                  defaultValue={siteLinks[s]?.price ?? ""}
                />
                <input
                  name={`siteAsin_${s}`}
                  className="input sm:col-span-2"
                  placeholder="站外主推 ASIN / 热卖 ASIN"
                  defaultValue={siteLinks[s]?.asin ?? ""}
                />
              </div>
            </div>
          ))}

          <div>
            <label className="label">品牌竞品</label>
            <input
              name="competitor"
              className="input"
              placeholder="竞品品牌名称 / 链接"
              defaultValue={defaults?.competitor ?? ""}
            />
          </div>
        </div>
      </SectionCard>

      {/* ② 推广平台信息 */}
      <SectionCard
        index="②"
        title="推广平台信息"
        accent="border-emerald-200 bg-emerald-50/60"
      >
        <div className="space-y-3">
          <div>
            <label className="label">目标平台（可多选）</label>
            <div className="flex flex-wrap gap-3">
              {PROMO_PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name={`platform_${p}`}
                    className="rounded border-slate-300"
                    checked={platforms.includes(p)}
                    onChange={() => toggle(platforms, setPlatforms, p)}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>
          {platforms.map((p) => (
            <div key={p}>
              <label className="label text-xs">{p}月 GMV 区间</label>
              <input
                name={`platformGmv_${p}`}
                className="input"
                placeholder={`${p} 的月度 GMV 区间`}
                defaultValue={platformGmv[p] ?? ""}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ③ 历史推广 */}
      <SectionCard
        index="③"
        title="历史推广"
        accent="border-amber-200 bg-amber-50/60"
      >
        <div className="space-y-3">
          <div>
            <label className="label">亚马逊站内广告 ACOS</label>
            <input
              name="amazonAcos"
              className="input"
              placeholder="如：25%"
              defaultValue={defaults?.amazonAcos ?? ""}
            />
          </div>
          <div>
            <label className="label">亚马逊站内推广 ACOS 备注</label>
            <textarea
              name="amazonAcosNote"
              className="input"
              rows={2}
              placeholder="补充说明 ACOS 相关情况（可选）"
              defaultValue={defaults?.amazonAcosNote ?? ""}
            />
          </div>
          <div>
            <label className="label">
              社媒推广情况（INS / FB 等网红 KOL 合作）
            </label>
            <textarea
              name="socialMediaInfo"
              className="input"
              rows={2}
              defaultValue={defaults?.socialMediaInfo ?? ""}
            />
          </div>
          <div>
            <label className="label">
              是否做过联盟营销及相关情况（平台、月度 GMV、占比、卡点、痛点）
            </label>
            <textarea
              name="affiliateHistory"
              className="input"
              rows={3}
              defaultValue={defaults?.affiliateHistory ?? ""}
            />
          </div>
          <div>
            <label className="label">
              具体用的平台（ACC / Levanta / PartnerBoost 等）
            </label>
            <input
              name="affiliatePlatforms"
              className="input"
              defaultValue={defaults?.affiliatePlatforms ?? ""}
            />
          </div>
        </div>
      </SectionCard>

      {/* ④ 目标与预算 */}
      <SectionCard
        index="④"
        title="目标与预算"
        accent="border-violet-200 bg-violet-50/60"
      >
        <div className="space-y-3">
          <div>
            <label className="label">推广目标（可多选）</label>
            <div className="flex flex-wrap gap-3">
              {PROMOTION_GOALS.map((g) => (
                <label key={g} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="promotionGoals"
                    value={g}
                    className="rounded border-slate-300"
                    defaultChecked={goals.includes(g)}
                  />
                  {g}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">目标 GMV 或单量（月）</label>
            <input
              name="targetGmv"
              className="input"
              defaultValue={defaults?.targetGmv ?? ""}
            />
          </div>
          <div>
            <label className="label">
              针对优质渠道是否有固定费用预算（单渠道范围）
            </label>
            <input
              name="channelBudget"
              className="input"
              defaultValue={defaults?.channelBudget ?? ""}
            />
          </div>
          <div>
            <label className="label">是否有联盟团队及具体负责工作</label>
            <textarea
              name="affiliateTeam"
              className="input"
              rows={2}
              defaultValue={defaults?.affiliateTeam ?? ""}
            />
          </div>
        </div>
      </SectionCard>

      {includeContacts && (
        <SectionCard
          index="◎"
          title="联系人信息（选填）"
          accent="border-slate-200 bg-slate-50"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label text-xs">联系人姓名</label>
              <input
                name="contactName"
                className="input"
                defaultValue={defaults?.contactName ?? ""}
              />
            </div>
            <div>
              <label className="label text-xs">联系邮箱</label>
              <input
                name="contactEmail"
                type="email"
                className="input"
                defaultValue={defaults?.contactEmail ?? ""}
              />
            </div>
            <div>
              <label className="label text-xs">联系电话</label>
              <input
                name="contactPhone"
                className="input"
                defaultValue={defaults?.contactPhone ?? ""}
              />
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
