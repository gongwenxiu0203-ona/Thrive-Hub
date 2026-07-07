import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { runCustomerStatusChecks, parseStringArray } from "@/lib/customer";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchFilter } from "@/components/ui/Filters";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import { IntakeLinkButton } from "@/components/IntakeLinkButton";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_COLORS,
  RATING_LABELS,
  RATING_COLORS,
  AMAZON_CATEGORIES,
  PROMO_PLATFORMS,
  PROMOTION_GOALS,
  CONTRACT_STATUS_LABELS,
  labelOf,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { CustomerFormModal } from "./CustomerFormModal";
import { QuickCreateModal } from "./QuickCreateModal";
import { CustomerImportModal } from "./CustomerImportModal";
import { requireSession } from "@/lib/session";
import { customerScope, isStaff, parseViewScope } from "@/lib/dataScope";
import { ScopeToggle } from "@/components/ScopeToggle";
import { CustomerTableClient, type CustomerTableRow } from "./CustomerTableClient";

export const metadata = { title: "客户管理 · Thraive联盟营销系统" };

type CustomerRow = Awaited<ReturnType<typeof loadCustomers>>[number];

async function loadCustomers(where: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.customer.findMany as any)({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      businessOwner: true,
      backendOwner: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contracts: { where: { deletedAt: null } as any, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

function csv(sp: Record<string, string | undefined>, key: string): string[] {
  return (sp[key] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type Filters = {
  status: string[];
  platform: string[];
  goal: string[];
  rating: string[];
  business: string[];
  backend: string[];
  category: string[];
  q: string;
};

// A customer matches if every active filter group matches. `exclude` skips one
// group so we can compute that group's still-available options (cascading).
function matches(
  c: CustomerRow,
  f: Filters,
  exclude?: keyof Filters,
): boolean {
  const platforms = parseStringArray(c.targetPlatforms);
  const goals = parseStringArray(c.promotionGoals);

  if (exclude !== "status" && f.status.length && !f.status.includes(c.status))
    return false;
  if (
    exclude !== "platform" &&
    f.platform.length &&
    !f.platform.some((p) => platforms.includes(p))
  )
    return false;
  if (
    exclude !== "goal" &&
    f.goal.length &&
    !f.goal.some((g) => goals.includes(g))
  )
    return false;
  if (exclude !== "rating" && f.rating.length && !f.rating.includes(c.rating))
    return false;
  if (
    exclude !== "business" &&
    f.business.length &&
    !(c.businessOwnerId && f.business.includes(c.businessOwnerId))
  )
    return false;
  if (
    exclude !== "backend" &&
    f.backend.length &&
    !(c.backendOwnerId && f.backend.includes(c.backendOwnerId))
  )
    return false;
  if (
    exclude !== "category" &&
    f.category.length &&
    !(c.category && f.category.includes(c.category))
  )
    return false;
  if (exclude !== "q" && f.q) {
    const q = f.q.toLowerCase();
    const hay = [c.brandName, c.contactName, c.contactEmail, c.category]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();

  // 仅内部员工才跑全局客户状态校验，避免外部角色触发昂贵全表扫描
  if (isStaff(session.role)) await runCustomerStatusChecks();

  const isChannel = session.role === "CHANNEL";
  const sp = await searchParams;
  const view = session.role === "ADMIN"
    ? sp.scope === "mine" ? "mine" : "all"
    : parseViewScope(sp);
  const scope = customerScope(
    {
      userId: session.userId,
      role: session.role,
      brandName: session.brandName,
    },
    view,
  );

  const [customers, users] = await Promise.all([
    loadCustomers({ ...scope, deletedAt: null }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  const f: Filters = {
    status: csv(sp, "status"),
    platform: csv(sp, "platform"),
    goal: csv(sp, "goal"),
    rating: csv(sp, "rating"),
    business: csv(sp, "business"),
    backend: csv(sp, "backend"),
    category: csv(sp, "category"),
    q: (sp.q ?? "").trim(),
  };

  const filtered = customers.filter((c: CustomerRow) => matches(c, f));

  // Cascading option sets: each filter's options reflect customers that match
  // all *other* active filters.
  const opts = (key: keyof Filters) =>
    customers.filter((c: CustomerRow) => matches(c, f, key));

  const userName = new Map(users.map((u) => [u.id, u.name]));
  const uniq = (xs: (string | null | undefined)[]) =>
    [...new Set(xs.filter((x): x is string => !!x))];

  const statusOptions = Object.entries(CUSTOMER_STATUS_LABELS).map(([value, label]) => ({ value, label }));
  const platformPool = opts("platform").flatMap((c: CustomerRow) =>
    parseStringArray(c.targetPlatforms),
  );
  const platformOptions = PROMO_PLATFORMS.filter((p) =>
    platformPool.includes(p),
  ).map((p) => ({ value: p, label: p }));
  const goalPool = opts("goal").flatMap((c: CustomerRow) =>
    parseStringArray(c.promotionGoals),
  );
  const goalOptions = PROMOTION_GOALS.filter((g) => goalPool.includes(g)).map(
    (g) => ({ value: g, label: g }),
  );
  const ratingOptions = uniq(opts("rating").map((c: CustomerRow) => c.rating)).map((r) => ({
    value: r,
    label: labelOf(RATING_LABELS, r),
  }));
  const businessOptions = uniq(
    opts("business").map((c: CustomerRow) => c.businessOwnerId),
  ).map((id) => ({ value: id, label: userName.get(id) ?? id }));
  const backendOptions = uniq(
    opts("backend").map((c: CustomerRow) => c.backendOwnerId),
  ).map((id) => ({ value: id, label: userName.get(id) ?? id }));
  const categoryOptions = AMAZON_CATEGORIES.map((cat) => ({ value: cat, label: cat }));

  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));
  const tableRows: CustomerTableRow[] = filtered.map((c: CustomerRow) => {
    const latestContract = c.contracts?.[0] ?? null;
    const latestContractLabel = latestContract
      ? labelOf(CONTRACT_STATUS_LABELS, latestContract.status)
      : "-";
    return {
      id: c.id,
      brandName: c.brandName,
      category: c.category,
      mainSites: parseStringArray(c.mainSites),
      targetPlatforms: parseStringArray(c.targetPlatforms),
      affiliatePlatforms: c.affiliatePlatforms,
      status: c.status,
      rating: c.rating,
      businessOwnerId: c.businessOwnerId,
      businessOwnerName: c.businessOwner?.name ?? null,
      backendOwnerId: c.backendOwnerId,
      backendOwnerName: c.backendOwner?.name ?? null,
      source: c.source,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      latestContractId: latestContract?.id ?? null,
      latestContractNo: latestContract?.contractNo ?? null,
      latestContractStatus: latestContract?.status ?? null,
      latestContractLabel,
    };
  });

  return (
    <div>
      <PageHeader
        title="客户管理"
        description={
          isStaff(session.role)
            ? view === "mine"
              ? "仅显示与你相关的客户（默认）"
              : "全部客户视图"
            : "品牌客户管理"
        }
        actions={
          <>
            {isStaff(session.role) && <ScopeToggle defaultView={session.role === "ADMIN" ? "all" : "mine"} />}
            <IntakeLinkButton
              channelUserId={isChannel ? session.userId : undefined}
              staffUserId={isStaff(session.role) ? session.userId : undefined}
            />
            <CustomerImportModal />
            <QuickCreateModal />
            <CustomerFormModal users={userOptions} />
          </>
        }
      />

      <CustomerTableClient
        rows={tableRows}
        users={userOptions}
        isStaff={isStaff(session.role)}
        canDeleteCustomers={session.role === "ADMIN"}
        isChannel={isChannel}
        staffUserId={isStaff(session.role) ? session.userId : undefined}
        channelUserId={isChannel ? session.userId : undefined}
        filterControls={
          <>
        <SearchFilter placeholder="搜索品牌 / 联系人 / 邮箱" />
        <MultiSelectFilter
          paramKey="status"
          placeholder="客户进度"
          options={statusOptions}
        />
        <MultiSelectFilter
          paramKey="rating"
          placeholder="客户评级"
          options={ratingOptions}
        />
        <MultiSelectFilter
          paramKey="category"
          placeholder="品类"
          options={categoryOptions}
        />
        <MultiSelectFilter
          paramKey="platform"
          placeholder="目标推广平台"
          options={platformOptions}
        />
        <MultiSelectFilter
          paramKey="goal"
          placeholder="推广目标"
          options={goalOptions}
        />
        <MultiSelectFilter
          paramKey="business"
          placeholder="商务负责人"
          options={businessOptions}
        />
        <MultiSelectFilter
          paramKey="backend"
          placeholder="后端负责人"
          options={backendOptions}
        />
          </>
        }
      />

      <p className="mt-3 text-xs text-slate-400">
        共 {filtered.length} / {customers.length} 位客户
        {customers[0] && ` · 最近更新 ${formatDate(customers[0].updatedAt)}`}
      </p>
    </div>
  );
}
