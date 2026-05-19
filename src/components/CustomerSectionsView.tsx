import type { SiteLinks } from "@/lib/customer";

type ViewData = {
  mainSites: string[];
  siteLinks: SiteLinks;
  competitor: string | null;
  targetPlatforms: string[];
  platformGmv: Record<string, string>;
  amazonAcos: string | null;
  socialMediaInfo: string | null;
  affiliateHistory: string | null;
  affiliatePlatforms: string | null;
  promotionGoals: string[];
  targetGmv: string | null;
  channelBudget: string | null;
  affiliateTeam: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

function Section({
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 text-sm">
      <span className="w-28 shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 break-words text-slate-700">
        {value || <span className="text-slate-300">—</span>}
      </span>
    </div>
  );
}

export function CustomerSectionsView({ data }: { data: ViewData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ① 基础信息 */}
      <Section
        index="①"
        title="基础信息"
        accent="border-sky-200 bg-sky-50/60"
      >
        <Row
          label="主营站点"
          value={data.mainSites.join(" / ")}
        />
        {data.mainSites.map((s) => {
          const sl = data.siteLinks[s];
          if (!sl) return null;
          return (
            <div
              key={s}
              className="mt-2 rounded-lg border border-sky-200 bg-white p-2"
            >
              <p className="mb-1 text-xs font-semibold text-sky-700">
                {s} 站点
              </p>
              <Row
                label="店铺/产品链接"
                value={
                  sl.link ? (
                    <a
                      href={sl.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 hover:underline"
                    >
                      {sl.link}
                    </a>
                  ) : null
                }
              />
              <Row label="客单价（$）" value={sl.price} />
              <Row label="主推 ASIN" value={sl.asin} />
            </div>
          );
        })}
        <Row label="品牌竞品" value={data.competitor} />
        {(data.contactName || data.contactEmail || data.contactPhone) && (
          <div className="mt-2 border-t border-sky-200 pt-2">
            <Row label="联系人" value={data.contactName} />
            <Row label="联系邮箱" value={data.contactEmail} />
            <Row label="联系电话" value={data.contactPhone} />
          </div>
        )}
      </Section>

      {/* ② 推广平台信息 */}
      <Section
        index="②"
        title="推广平台信息"
        accent="border-emerald-200 bg-emerald-50/60"
      >
        <Row
          label="目标平台"
          value={data.targetPlatforms.join(" / ")}
        />
        {data.targetPlatforms.map((p) => (
          <Row
            key={p}
            label={`${p}月GMV`}
            value={data.platformGmv[p]}
          />
        ))}
      </Section>

      {/* ③ 历史推广 */}
      <Section
        index="③"
        title="历史推广"
        accent="border-amber-200 bg-amber-50/60"
      >
        <Row label="站内广告ACOS" value={data.amazonAcos} />
        <Row label="社媒推广情况" value={data.socialMediaInfo} />
        <Row label="联盟营销情况" value={data.affiliateHistory} />
        <Row label="使用的平台" value={data.affiliatePlatforms} />
      </Section>

      {/* ④ 目标与预算 */}
      <Section
        index="④"
        title="目标与预算"
        accent="border-violet-200 bg-violet-50/60"
      >
        <Row
          label="推广目标"
          value={data.promotionGoals.join("、")}
        />
        <Row label="目标GMV/单量" value={data.targetGmv} />
        <Row label="渠道固定预算" value={data.channelBudget} />
        <Row label="联盟团队情况" value={data.affiliateTeam} />
      </Section>
    </div>
  );
}
