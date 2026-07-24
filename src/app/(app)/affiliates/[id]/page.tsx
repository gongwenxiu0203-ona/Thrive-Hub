import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { AFFILIATE_DEV_STATUS_COLORS } from "@/lib/constants";
import { parsePlacements } from "@/lib/affiliateFields";
import AffiliateDetailClient from "./AffiliateDetailClient";
import { AffiliateSalesPanel, type SaleRec } from "./AffiliateSalesPanel";
import AffiliateMediaKitPanel, { type MediaKitItem } from "./AffiliateMediaKitPanel";

export const dynamic = "force-dynamic";

export default async function AffiliateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const affiliate = await prisma.affiliate.findFirst({
    where: { id, deletedAt: null },
    include: {
      personInCharge: { select: { id: true, name: true, email: true } },
      coopReviews: { orderBy: { createdAt: "desc" } },
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!affiliate || (affiliate as any).deletedAt) notFound();

  // Linked accounts (same internalAffiliateName)
  const linkedAccounts = affiliate.internalAffiliateName
    ? await prisma.affiliate.findMany({
        where: {
          internalAffiliateName: affiliate.internalAffiliateName,
          id: { not: id },
          deletedAt: null,
        },
        select: { id: true, platformAffiliateName: true, developmentStatus: true },
      })
    : [];

  // Sales data linked by platformAffiliateName
  const rawSalesRecords = await prisma.salesRecord.findMany({
    where: { affiliateName: affiliate.platformAffiliateName, deletedAt: null },
    orderBy: { orderDate: "desc" },
    take: 2000,
    select: {
      id: true, orderDate: true, brand: true, store: true,
      asin: true, revenue: true, unitsSold: true, commission: true,
      commissionRate: true, affiliatePlatform: true, affiliateProgram: true,
      storeProductLabel: true,
    },
  });

  // Serialize dates for client components
  const salesRecords: SaleRec[] = rawSalesRecords.map(r => ({
    ...r,
    orderDate: r.orderDate.toISOString(),
    store: r.store ?? null,
    asin: r.asin ?? null,
    affiliateProgram: r.affiliateProgram ?? null,
    storeProductLabel: r.storeProductLabel ?? null,
  }));

  // Users for edit form + coop review
  const users = await prisma.user.findMany({
    where: { status: "APPROVED" },
    select: { id: true, name: true },
  });
  // Customers for coop review
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    select: { id: true, brandName: true, businessOwnerId: true, backendOwnerId: true },
    orderBy: { brandName: "asc" },
  });

  const statusColor = AFFILIATE_DEV_STATUS_COLORS[affiliate.developmentStatus ?? ""] ?? "bg-slate-100 text-slate-600";

  // Pre-parse placements for SSR display
  const wPlacements = parsePlacements(affiliate.websitePlacements);
  const iPlacements = parsePlacements(affiliate.instagramPlacements);
  const fbPlacements = parsePlacements(affiliate.facebookPlacements);
  const ytPlacements = parsePlacements(affiliate.youtubePlacements);
  const tkPlacements = parsePlacements(affiliate.tiktokPlacements);

  // Parse customerCooperations
  let customerCoops: { customerId: string; customerName: string; status: string }[] = [];
  try { customerCoops = JSON.parse(affiliate.customerCooperations); } catch { /* ignore */ }

  // Parse 往期推广内容
  let promoContents: { brand: string; publishedAt: string; promoLink: string }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { promoContents = JSON.parse((affiliate as any).promoContents ?? "[]"); } catch { /* ignore */ }

  let mediaKitItems: MediaKitItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { mediaKitItems = JSON.parse((affiliate as any).mediaKitItems ?? "[]"); } catch { /* ignore */ }

  // Extract platforms with ANY recorded data for CoopReviewModal dropdown
  // (link auto-fills if present, but we show a platform as long as it has any data)
  const affiliatePlatforms: { name: string; link: string | null }[] = [
    { name: "Website", link: affiliate.websiteLink,
      hasData: !!(affiliate.websiteLink || affiliate.websiteTraffic || affiliate.websiteNote) },
    { name: "Instagram", link: affiliate.instagramLink,
      hasData: !!(affiliate.instagramLink || affiliate.insFollowers || affiliate.insNote) },
    { name: "Facebook", link: affiliate.facebookLink,
      hasData: !!(affiliate.facebookLink || affiliate.fbFollowers || affiliate.fbNote) },
    { name: "YouTube", link: affiliate.youtubeLink,
      hasData: !!(affiliate.youtubeLink || affiliate.youtubeFollowers) },
    { name: "TikTok", link: affiliate.tiktokLink,
      hasData: !!(affiliate.tiktokLink || affiliate.tiktokFollowers) },
    { name: "Amazon Storefront", link: affiliate.amazonStorefrontLink,
      hasData: !!(affiliate.amazonStorefrontLink || affiliate.topCreator || affiliate.storefrontFlatfee || affiliate.storefrontNote) },
    { name: "LTK", link: affiliate.ltkLink,
      hasData: !!(affiliate.ltkLink || affiliate.ltkFlatfee) },
    { name: "Pinterest", link: affiliate.pinterestLink,
      hasData: !!(affiliate.pinterestLink || affiliate.pinterestFlatfee) },
  ].filter(p => p.hasData).map(p => ({ name: p.name, link: p.link ?? null }));

  return (
    <div className="space-y-6">
      {/* Back */}
      <BackButton label="返回资源库" chevron fallbackHref="/affiliates?tab=list" />

      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{affiliate.platformAffiliateName}</h1>
          {affiliate.internalAffiliateName && (
            <p className="mt-0.5 text-sm text-slate-500">内部名称: {affiliate.internalAffiliateName}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {affiliate.developmentStatus && (
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor}`}>
                {affiliate.developmentStatus}
              </span>
            )}
            {affiliate.category && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{affiliate.category}</span>
            )}
            {affiliate.source && (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-600">{affiliate.source}</span>
            )}
          </div>
        </div>
        <AffiliateDetailClient
          affiliateId={id}
          affiliate={affiliate as unknown as Record<string, unknown>}
          users={users}
          customers={customers.map((c) => ({
            id: c.id,
            brandName: c.brandName,
            ownerIds: [c.businessOwnerId, c.backendOwnerId].filter((x): x is string => !!x),
          }))}
          affiliatePlatforms={affiliatePlatforms}
          salesData={salesRecords}
          currentUserId={session.userId}
          canDelete={isStaff(session.role)}
        />
      </div>

      {/* ── TOP: Basic info (3-col grid) ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2/3: Core info + social channels */}
        <div className="space-y-5 lg:col-span-2">
          {/* 基础信息 */}
          <InfoCard title="基础信息">
            <InfoGrid>
              <InfoRow label="联盟商类型 Type" value={affiliate.affiliateType} />
              <InfoRow label="合作模式" value={parseArr(affiliate.cooperationMode).join(" / ")} />
              <InfoRow label="样品寄送" value={affiliate.sampleShipping} />
              <InfoRow label="负责人" value={affiliate.personInCharge?.name} />
              <InfoRow label="负责人建联邮箱" value={affiliate.contactEmail} link={affiliate.contactEmail ? `mailto:${affiliate.contactEmail}` : undefined} />
              <InfoRow label="联系方式" value={affiliate.contactInfo} link={affiliate.contactInfo ?? undefined} />
            </InfoGrid>
            {parseArr(affiliate.tags).length > 0 && (
              <TagRow label="联盟商标签" tags={parseArr(affiliate.tags)} />
            )}
            {parseArr((affiliate as unknown as { promotionPlacements?: string }).promotionPlacements).length > 0 && (
              <TagRow
                label="推广版位"
                tags={parseArr((affiliate as unknown as { promotionPlacements?: string }).promotionPlacements)}
              />
            )}
            {affiliate.note && (
              <div className="mt-3">
                <p className="text-xs text-slate-500">备注</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{affiliate.note}</p>
              </div>
            )}
          </InfoCard>

          {/* 开发情况 */}
          <InfoCard title="开发情况">
            {customerCoops.length > 0 ? (
              <div className="space-y-2">
                {customerCoops.map((c, i) => {
                  const color = AFFILIATE_DEV_STATUS_COLORS[c.status] ?? "bg-slate-100 text-slate-600";
                  return (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                      <span className="text-sm font-medium text-slate-800">{c.customerName}</span>
                      {c.status && (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>{c.status}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <InfoGrid>
                <InfoRow label="整体开发状态" value={affiliate.developmentStatus} />
              </InfoGrid>
            )}
            {affiliate.developmentDesc && (
              <div className="mt-3">
                <p className="text-xs text-slate-500">开发情况描述</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{affiliate.developmentDesc}</p>
              </div>
            )}
          </InfoCard>

          {/* 往期推广内容 */}
          <InfoCard title="往期推广内容">
            {promoContents.length === 0 ? (
              <p className="text-xs text-slate-400">暂无往期推广内容记录</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th className="px-2 py-1.5 text-left font-medium">品牌</th>
                      <th className="px-2 py-1.5 text-left font-medium">发布时间</th>
                      <th className="px-2 py-1.5 text-left font-medium">推广链接</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoContents.map((pc, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0">
                        <td className="px-2 py-1.5 text-slate-700">{pc.brand || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{pc.publishedAt || "—"}</td>
                        <td className="px-2 py-1.5">
                          {pc.promoLink ? (
                            <a href={safeHref(pc.promoLink)} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-brand-600 hover:underline max-w-[220px] truncate">
                              <span className="truncate">{pc.promoLink}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </InfoCard>

          {/* 社媒渠道 */}
          <InfoCard title="社媒渠道">
            <div className="grid gap-2 sm:grid-cols-2">
              <PlatformSection
                icon="🌐" title="Website" accentColor="bg-slate-200"
                link={affiliate.websiteLink}
                followers={affiliate.websiteTraffic ? `${affiliate.websiteTraffic}K 月流量` : null}
                note={affiliate.websiteNote}
                placements={wPlacements}
              />
              <PlatformSection
                icon="📸" title="Instagram" accentColor="bg-pink-100"
                link={affiliate.instagramLink}
                followers={affiliate.insFollowers ? `${affiliate.insFollowers}K 粉丝` : null}
                note={affiliate.insNote}
                placements={iPlacements}
              />
              <PlatformSection
                icon="👥" title="Facebook" accentColor="bg-blue-100"
                link={affiliate.facebookLink}
                followers={affiliate.fbFollowers ? `${affiliate.fbFollowers}K 粉丝` : null}
                note={affiliate.fbNote}
                placements={fbPlacements}
              />
              <PlatformSection
                icon="▶️" title="YouTube" accentColor="bg-red-100"
                link={affiliate.youtubeLink}
                followers={affiliate.youtubeFollowers ? `${affiliate.youtubeFollowers}K 粉丝` : null}
                placements={ytPlacements}
              />
              <PlatformSection
                icon="🎵" title="TikTok" accentColor="bg-slate-800/10"
                link={affiliate.tiktokLink}
                followers={affiliate.tiktokFollowers ? `${affiliate.tiktokFollowers}K 粉丝` : null}
                placements={tkPlacements}
              />
              <PlatformSection
                icon="🛒" title="Amazon Storefront" accentColor="bg-amber-100"
                link={affiliate.amazonStorefrontLink}
                extra={[
                  affiliate.topCreator ? `Top Creator: ${affiliate.topCreator}` : null,
                  affiliate.storefrontFlatfee ? `Flatfee: $${affiliate.storefrontFlatfee}` : null,
                  affiliate.storefrontNote,
                ].filter(Boolean).join(" · ")}
              />
              <PlatformSection icon="🛍️" title="LTK" accentColor="bg-rose-100"
                link={affiliate.ltkLink}
                extra={affiliate.ltkFlatfee ? `Flatfee: $${affiliate.ltkFlatfee}` : null} />
              <PlatformSection icon="📌" title="Pinterest" accentColor="bg-red-100"
                link={affiliate.pinterestLink}
                extra={affiliate.pinterestFlatfee ? `Flatfee: $${affiliate.pinterestFlatfee}` : null} />
            </div>
            {affiliate.flatfeeSupplementary && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <span className="font-medium">Flatfee合作费用补充：</span>{affiliate.flatfeeSupplementary}
              </div>
            )}
          </InfoCard>

          <InfoCard title="Rate card / Media kit">
            <AffiliateMediaKitPanel affiliateId={id} initialItems={mediaKitItems} />
          </InfoCard>
        </div>

        {/* Right sidebar: 关联账号 + 合作客户 + 合作审核记录 */}
        <div className="space-y-5">
          {linkedAccounts.length > 0 && (
            <InfoCard title="关联账号">
              <div className="space-y-2">
                {linkedAccounts.map((a) => (
                  <Link key={a.id} href={`/affiliates/${a.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-2 hover:bg-slate-50">
                    <span className="text-sm font-medium text-slate-700">{a.platformAffiliateName}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  </Link>
                ))}
              </div>
            </InfoCard>
          )}

          <InfoCard title="合作客户">
            {customerCoops.length === 0 ? (
              <p className="text-xs text-slate-400">暂无合作客户记录</p>
            ) : (
              <div className="space-y-2">
                {customerCoops.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded border border-slate-100 p-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.customerName}</p>
                      <p className="text-xs text-slate-500">{c.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </InfoCard>

          <InfoCard title="合作审核记录">
            {affiliate.coopReviews.length === 0 ? (
              <p className="text-xs text-slate-400">暂无审核记录</p>
            ) : (
              <div className="space-y-3">
                {affiliate.coopReviews.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-100 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{r.customerName ?? "未关联客户"}</span>
                      <span className="text-slate-400">{new Date(r.createdAt).toLocaleDateString("zh")}</span>
                    </div>
                    {r.platform && <p className="text-slate-500">平台: {r.platform}</p>}
                    {r.fee && <p className="text-slate-500">费用: ${r.fee}</p>}
                    {r.customerStatus && (
                      <span className="inline-block rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">{r.customerStatus}</span>
                    )}
                    {r.notes && <p className="whitespace-pre-wrap text-slate-600">{r.notes}</p>}
                    {r.reviewerName && <p className="text-slate-400">审核人: {r.reviewerName}</p>}
                  </div>
                ))}
              </div>
            )}
          </InfoCard>
        </div>
      </div>

      {/* ── BOTTOM: Historical sales data ── */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700">↓</div>
          <h2 className="text-sm font-bold text-slate-700">往期合作数据</h2>
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">
            {salesRecords.length} 条记录 · 按联盟商名称「{affiliate.platformAffiliateName}」关联 BI 数据
          </span>
        </div>
        <AffiliateSalesPanel salesRecords={salesRecords} />
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseArr(v: unknown): string[] {
  if (typeof v === "string") { try { return JSON.parse(v) ?? []; } catch { return []; } }
  if (Array.isArray(v)) return v;
  return [];
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="mb-3 border-l-2 border-brand-500 pl-2 text-sm font-semibold text-slate-800">{title}</h2>
      {children}
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

function InfoRow({ label, value, link }: { label: string; value?: string | null; link?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-sm text-brand-600 hover:underline">
          {value}<ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <p className="mt-0.5 text-sm text-slate-800">{value}</p>
      )}
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {tags.map((t) => (
          <span key={t} className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">{t}</span>
        ))}
      </div>
    </div>
  );
}

function safeHref(link: string | null | undefined): string | undefined {
  if (!link) return undefined;
  const s = link.trim();
  if (!s) return undefined;
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("mailto:")) return s;
  return `https://${s}`;
}

function PlatformSection({
  icon, title, link, followers, note, extra, placements, accentColor,
}: {
  icon: string; title: string;
  link?: string | null; followers?: string | null;
  note?: string | null; extra?: string | null;
  placements?: import("@/lib/affiliateFields").PlacementEntry[];
  accentColor?: string;
}) {
  if (!link && !followers && !extra && !placements?.length) return null;
  const href = safeHref(link);
  return (
    <div className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition-all hover:bg-white hover:shadow-sm">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${accentColor ?? "bg-slate-100"}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          {followers && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600">
              {followers}
            </span>
          )}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-brand-700"
            >
              访问主页 <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        {extra && <p className="mt-1 text-xs text-slate-500">{extra}</p>}
        {note && <p className="mt-0.5 text-xs italic text-slate-400">{note}</p>}
        {placements && placements.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {placements.map((p, i) => (
              <span key={i} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-600">
                {p.placement}{p.flatfee != null ? ` · $${p.flatfee}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
