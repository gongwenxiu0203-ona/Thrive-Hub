// Centralized role-based access policy.
// Roles: ADMIN | USER | LYNQ_STAFF | BRAND | CHANNEL | GUEST

export const STAFF_ROLES = ["ADMIN", "USER", "LYNQ_STAFF"] as const;

export function isStaff(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function canDeleteCustomer(role: string): boolean {
  return isStaff(role);
}

// Page routes a role is NOT allowed to view. Middleware redirects to landing.
export const ROLE_BLOCKED_ROUTES: Record<string, string[]> = {
  BRAND: ["/dashboard", "/customers", "/contracts", "/affiliates", "/tasks"],
  CHANNEL: ["/dashboard", "/contracts", "/affiliates", "/tasks"],
};

// Where to send a role on login or when they hit a blocked page.
export const ROLE_LANDING: Record<string, string> = {
  BRAND: "/bi",
  CHANNEL: "/customers",
};

export function isRouteBlocked(pathname: string, role: string): boolean {
  const blocked = ROLE_BLOCKED_ROUTES[role] ?? [];
  return blocked.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function getRoleLanding(role: string): string {
  return ROLE_LANDING[role] ?? "/dashboard";
}

// Sidebar nav hrefs each restricted role can see. Returns null = show all.
const ROLE_NAV_VISIBLE: Record<string, string[]> = {
  BRAND: ["/reminders", "/bi"],
  CHANNEL: ["/customers", "/reminders", "/bi"],
};

export function visibleNavForRole(role: string): string[] | null {
  return ROLE_NAV_VISIBLE[role] ?? null;
}
