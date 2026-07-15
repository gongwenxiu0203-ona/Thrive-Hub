import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { IntakeForm } from "../IntakeForm";
import { verifyIntakeToken } from "@/lib/intakeToken";
import {
  parseStringArray,
  parseSiteLinks,
  parseRecord,
} from "@/lib/customer";

export const metadata = {
  title: "品牌信息收集表 · 联盟营销服务",
  robots: { index: false },
};

export default async function CustomerIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { customerId } = await params;
  const sp = await searchParams;
  const token = sp.token ?? "";
  const claims = token ? await verifyIntakeToken(token) : null;
  if (!claims || claims.type !== "CUSTOMER_UPDATE" || claims.customerId !== customerId) notFound();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer) notFound();

  const defaults = {
    brandName: customer.brandName,
    referrerName: customer.referrerName,
    mainSites: parseStringArray(customer.mainSites),
    siteLinks: parseSiteLinks(customer.siteLinks),
    competitor: customer.competitor,
    targetPlatforms: parseStringArray(customer.targetPlatforms),
    platformGmv: parseRecord(customer.platformGmv),
    amazonAcos: customer.amazonAcos,
    amazonAcosNote: customer.amazonAcosNote,
    socialMediaInfo: customer.socialMediaInfo,
    affiliateHistory: customer.affiliateHistory,
    affiliatePlatforms: customer.affiliatePlatforms,
    promotionGoals: parseStringArray(customer.promotionGoals),
    targetGmv: customer.targetGmv,
    channelBudget: customer.channelBudget,
    affiliateTeam: customer.affiliateTeam,
    contactName: customer.contactName,
    contactEmail: customer.contactEmail,
    contactPhone: customer.contactPhone,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-brand-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            AM
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            品牌信息收集表
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            请确认并补全贵品牌的信息，我们的联盟营销团队会尽快与您对接
          </p>
        </div>
        <div className="card p-6 sm:p-8">
          <IntakeForm
            customerId={customer.id}
            token={token}
            defaults={defaults}
          />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          您提交的信息将仅用于联盟营销服务对接
        </p>
      </div>
    </div>
  );
}
