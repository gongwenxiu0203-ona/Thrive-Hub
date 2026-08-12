import {
  FEATURES,
  PERM_LEVELS,
  type PermLevel,
} from "@/lib/featurePermissions";

export type PermissionMap = Record<string, PermLevel>;

type RouteRequirement = {
  features: string[];
  required?: PermLevel;
  mode?: "any" | "all";
};

const ADMIN_FEATURES = FEATURES
  .filter((feature) => feature.key.startsWith("admin."))
  .map((feature) => feature.key);

const RECYCLE_FEATURES = [
  "customers.records",
  "contracts.records",
  "affiliates.records",
  "tasks.board",
  "worklogs.records",
  "reminders.records",
  "bi.manage",
  "projects.records",
];

function startsWithRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function hasPermission(
  permissions: PermissionMap,
  feature: string,
  required: PermLevel = "READ",
): boolean {
  return (
    PERM_LEVELS.indexOf(permissions[feature] ?? "NONE") >=
    PERM_LEVELS.indexOf(required)
  );
}

export function hasAnyPermission(
  permissions: PermissionMap,
  features: string[],
  required: PermLevel = "READ",
): boolean {
  return features.some((feature) => hasPermission(permissions, feature, required));
}

export function routeRequirement(
  pathname: string,
  searchParams?: URLSearchParams,
): RouteRequirement | null {
  if (startsWithRoute(pathname, "/dashboard")) return { features: ["dashboard.view"] };
  if (startsWithRoute(pathname, "/customers")) return { features: ["customers.records"] };
  if (pathname === "/contracts/new") return { features: ["contracts.create_upload"], required: "EDIT" };
  if (startsWithRoute(pathname, "/contracts/reviews")) return { features: ["contracts.reviews"] };
  if (startsWithRoute(pathname, "/contracts/templates")) return { features: ["contracts.templates"] };
  if (startsWithRoute(pathname, "/contracts")) return { features: ["contracts.records"] };
  if (startsWithRoute(pathname, "/projects")) return { features: ["projects.records"] };
  if (startsWithRoute(pathname, "/tasks")) return { features: ["tasks.board"] };
  if (startsWithRoute(pathname, "/worklogs")) return { features: ["worklogs.records"] };
  if (startsWithRoute(pathname, "/bi")) return { features: ["bi.view"] };
  if (startsWithRoute(pathname, "/affiliates")) return { features: ["affiliates.records"] };
  if (startsWithRoute(pathname, "/finance/channel-reconciliations")) return { features: ["finance.channel_reconciliation"] };
  if (startsWithRoute(pathname, "/finance/affiliate-reconciliations")) return { features: ["finance.affiliate_reconciliation"] };
  if (startsWithRoute(pathname, "/finance/customers") || startsWithRoute(pathname, "/finance/reconciliations")) return { features: ["finance.customer_reconciliation"] };
  if (startsWithRoute(pathname, "/finance")) return { features: ["finance.customer_reconciliation", "finance.channel_reconciliation", "finance.affiliate_reconciliation"] };
  if (pathname === "/invoices/new") return { features: ["operations.invoices"], required: "EDIT" };
  if (startsWithRoute(pathname, "/invoices")) return { features: ["operations.invoices"] };
  if (startsWithRoute(pathname, "/operations")) {
    const tab = searchParams?.get("tab");
    const byTab: Record<string, string> = {
      revenue: "operations.revenue",
      count: "operations.customer_count",
      ar: "operations.accounts_receivable",
      pipeline: "operations.sales_pipeline",
      kpi: "operations.employee_kpi",
    };
    return tab && byTab[tab]
      ? { features: [byTab[tab]] }
      : { features: Object.values(byTab) };
  }
  if (startsWithRoute(pathname, "/reminders")) return { features: ["reminders.records"] };
  if (startsWithRoute(pathname, "/recycle-bin")) return { features: RECYCLE_FEATURES, required: "MANAGE", mode: "all" };
  if (startsWithRoute(pathname, "/admin")) {
    return searchParams?.get("tab") === "intake"
      ? { features: ["intake.review"] }
      : { features: [...ADMIN_FEATURES, "intake.review"] };
  }
  // Settings and other authenticated utility pages do not belong to the
  // 38-feature catalog and remain session-only.
  return null;
}

export function canAccessRoute(
  pathname: string,
  searchParams: URLSearchParams,
  permissions: PermissionMap,
): boolean {
  const requirement = routeRequirement(pathname, searchParams);
  if (!requirement) return true;
  const predicate = (feature: string) =>
    hasPermission(permissions, feature, requirement.required ?? "READ");
  return requirement.mode === "all"
    ? requirement.features.every(predicate)
    : requirement.features.some(predicate);
}

const LANDING_CANDIDATES = [
  ["/dashboard", ["dashboard.view"]],
  ["/customers", ["customers.records"]],
  ["/contracts", ["contracts.records"]],
  ["/projects", ["projects.records"]],
  ["/bi", ["bi.view"]],
  ["/affiliates", ["affiliates.records"]],
  ["/finance", ["finance.customer_reconciliation", "finance.channel_reconciliation", "finance.affiliate_reconciliation"]],
  ["/invoices", ["operations.invoices"]],
  ["/operations", ["operations.revenue", "operations.customer_count", "operations.accounts_receivable", "operations.sales_pipeline", "operations.employee_kpi"]],
  ["/reminders", ["reminders.records"]],
  ["/admin", [...ADMIN_FEATURES, "intake.review"]],
] as const;

export function permissionLanding(permissions: PermissionMap): string {
  return LANDING_CANDIDATES.find(([, features]) =>
    hasAnyPermission(permissions, [...features]),
  )?.[0] ?? "/settings";
}
