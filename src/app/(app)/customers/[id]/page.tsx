import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Calendar, Tag } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  parseStringArray,
  parseSiteLinks,
  parseRecord,
} from "@/lib/customer";
import { Badge } from "@/components/ui/Badge";
import { CustomerSectionsView } from "@/components/CustomerSectionsView";
import { ShareIntakeButton } from "@/components/ShareIntakeButton";
import { CustomerFormModal } from "../CustomerFormModal";
import { DeleteCustomerButton } from "./DeleteCustomerButton";
import { InternalManagement } from "./InternalManagement";
import { EvaluationModule, type EvaluationData } from "./EvaluationModule";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_COLORS,
  RATING_LABELS,
  RATING_COLORS,
  labelOf,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { isStaff } from "@/lib/permissions";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const [customer, channelRec] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        businessOwner: true,
        backendOwner: true,
        contracts: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.channelReconciliation.findFirst({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      include: { periods: { orderBy: { periodIndex: "asc" } } },
    }),
  ]);
  if (!customer) notFound();

  // 行级权限校验：品牌方只能看自己品牌，渠道商只能看自己的客户
  if (session.role === "BRAND" && session.brandName) {
    if (customer.brandName !== session.brandName) notFound();
  } else if (session.role === "CHANNEL") {
    if (
      customer.channelUserId !== session.userId &&
      customer.createdById !== session.userId
    ) {
      notFound();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerAny = customer as any;
  let evalData: EvaluationData | null = null;
  try {
    if (customerAny.evaluationData) evalData = JSON.parse(customerAny.evaluationData);
  } catch { /* ignore */ }

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));

  const sectionData = {
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

  const editData = {
    id: customer.id,
    brandName: customer.brandName,
    ...sectionData,
    category: customer.category,
    rating: customer.rating,
    businessOwnerId: customer.businessOwnerId,
    backendOwnerId: customer.backendOwnerId,
  };

  // Tasks split by responsible owner for the internal-management columns.
  const toLite = (t: (typeof customer.tasks)[number]) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    category: t.category,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  });
  const businessTasks = customer.tasks
    .filter((t) => t.ownerId === customer.businessOwnerId && customer.businessOwnerId)
    .map(toLite);
  const backendTasks = customer.tasks
    .filter((t) => t.ownerId === customer.backendOwnerId && customer.backendOwnerId)
    .map(toLite);

  return (
    <div className="space-y-6">
      {/* ── Back nav ── */}
      <BackButton label="返回客户列表" fallbackHref="/customers" />

      {/* ── Header card ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{customer.brandName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={`${CUSTOMER_STATUS_COLORS[customer.status]} border-0`}>
                  {labelOf(CUSTOMER_STATUS_LABELS, customer.status)}
                </Badge>
                <Badge className={`${RATING_COLORS[customer.rating]} border-0`}>
                  {labelOf(RATING_LABELS, customer.rating)}
                </Badge>
                {customer.category && (
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs text-white">
                    <Tag className="h-3 w-3" />{customer.category}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShareIntakeButton customerId={customer.id} brandName={customer.brandName} size="md" />
              <CustomerFormModal users={userOptions} customer={editData} />
              {isStaff(session.role) && <DeleteCustomerButton id={customer.id} />}
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 sm:grid-cols-4">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400">商务负责人</p>
              <p className="truncate text-sm font-medium text-slate-800">{customer.businessOwner?.name ?? "未分配"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400">后端负责人</p>
              <p className="truncate text-sm font-medium text-slate-800">{customer.backendOwner?.name ?? "未分配"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400">创建时间</p>
              <p className="text-sm font-medium text-slate-800">{formatDate(customer.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400">最近更新</p>
              <p className="text-sm font-medium text-slate-800">{formatDate(customer.updatedAt)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 客户信息 ── */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700">①</div>
          <h2 className="text-sm font-bold text-slate-700">客户信息</h2>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <CustomerSectionsView data={sectionData} />
      </div>

      {/* ── 内部管理 ── */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-700 text-xs font-bold text-white">②</div>
          <h2 className="text-sm font-bold text-slate-700">内部管理</h2>
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">仅内部可见</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <InternalManagement
            customerId={customer.id}
            customerName={customer.brandName}
            status={customer.status}
            businessOwnerId={customer.businessOwnerId}
            backendOwnerId={customer.backendOwnerId}
            channelUserId={customerAny.channelUserId ?? null}
            users={userOptions}
            contracts={customer.contracts.map((ct) => ({
              id: ct.id,
              contractNo: ct.contractNo,
              type: ct.type,
              status: ct.status,
            }))}
            businessTasks={businessTasks}
            backendTasks={backendTasks}
            channelRec={channelRec ? {
              totalPeriods: channelRec.totalPeriods,
              periodType: channelRec.periodType,
              fixedFeeTotal: channelRec.fixedFeeTotal,
              commissionTotal: channelRec.commissionTotal,
              paidPeriodsFixed: channelRec.periods.filter((p: { fixedFeePaidAt: Date | null }) => p.fixedFeePaidAt).length,
              paidPeriodsCommission: channelRec.periods.filter((p: { commissionPaidAt: Date | null }) => p.commissionPaidAt).length,
              paidFixed: channelRec.periods.reduce((s: number, p: { fixedFeeAmount: number | null; fixedFeePaidAt: Date | null }) => s + (p.fixedFeePaidAt && p.fixedFeeAmount ? p.fixedFeeAmount : 0), 0),
              paidCommission: channelRec.periods.reduce((s: number, p: { commissionAmount: number | null; commissionPaidAt: Date | null }) => s + (p.commissionPaidAt && p.commissionAmount ? p.commissionAmount : 0), 0),
            } : null}
          />
          <div className="sticky top-4">
            <EvaluationModule
              customerId={customer.id}
              initialData={evalData}
              initialRating={customer.rating}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        {customer.source === "INTAKE" ? "客户门户录入" : "内部录入"}
      </p>
    </div>
  );
}
