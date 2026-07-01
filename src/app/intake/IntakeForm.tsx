"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CustomerSectionFields,
  type CustomerSectionDefaults,
} from "@/components/CustomerSectionFields";
import { MAIN_SITES, PROMO_PLATFORMS } from "@/lib/constants";

// Build the intake JSON payload from the CustomerSectionFields form.
function buildPayload(form: HTMLFormElement, customerId?: string, channelId?: string, staffId?: string) {
  const fd = new FormData(form);
  const str = (k: string) => String(fd.get(k) ?? "").trim();

  const mainSites = MAIN_SITES.filter((s) => fd.get(`site_${s}`) === "on");
  const siteLinks: Record<string, unknown> = {};
  for (const s of mainSites) {
    siteLinks[s] = {
      link: str(`siteLink_${s}`),
      price: str(`sitePrice_${s}`),
      asin: str(`siteAsin_${s}`),
    };
  }

  const targetPlatforms = PROMO_PLATFORMS.filter(
    (p) => fd.get(`platform_${p}`) === "on",
  );
  const platformGmv: Record<string, string> = {};
  for (const p of targetPlatforms) {
    platformGmv[p] = str(`platformGmv_${p}`);
  }

  return {
    customerId: customerId ?? "",
    channelId: channelId ?? "",
    staffId: staffId ?? "",
    brandName: str("brandName"),
    mainSites,
    siteLinks,
    competitor: str("competitor"),
    targetPlatforms,
    platformGmv,
    amazonAcos: str("amazonAcos"),
    amazonAcosNote: str("amazonAcosNote"),
    socialMediaInfo: str("socialMediaInfo"),
    affiliateHistory: str("affiliateHistory"),
    affiliatePlatforms: str("affiliatePlatforms"),
    promotionGoals: fd.getAll("promotionGoals").map(String),
    targetGmv: str("targetGmv"),
    channelBudget: str("channelBudget"),
    affiliateTeam: str("affiliateTeam"),
    contactName: str("contactName"),
    contactEmail: str("contactEmail"),
    contactPhone: str("contactPhone"),
  };
}

export function IntakeForm({
  customerId,
  channelId,
  staffId,
  referrerLabel,
  defaults,
}: {
  customerId?: string;
  channelId?: string;
  staffId?: string;
  referrerLabel?: string | null;
  defaults?: CustomerSectionDefaults;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const payload = buildPayload(e.currentTarget, customerId, channelId, staffId);
    if ((!channelId && !staffId) || !referrerLabel) {
      setError("推荐人信息缺失，请使用有效的分享链接提交");
      setPending(false);
      return;
    }
    if (!payload.brandName) {
      setError("请填写品牌/店铺名称");
      setPending(false);
      return;
    }
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "提交失败，请稍后重试");
        setPending(false);
        return;
      }
      router.push("/intake/success");
    } catch {
      setError("网络错误，请稍后重试");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            推荐人 *
          </span>
          <input
            className="input w-full bg-white text-sm"
            value={referrerLabel ?? "推荐人信息缺失，请使用有效分享链接"}
            readOnly
          />
        </label>
      </div>
      <CustomerSectionFields defaults={defaults} includeContacts />

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "提交中…" : "提交信息"}
      </button>
    </form>
  );
}
