// Centralized role-based access policy.
// Roles: ADMIN | USER | BRAND | CHANNEL

export const STAFF_ROLES = ["ADMIN", "USER"] as const;

export function isStaff(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function canDeleteCustomer(role: string): boolean {
  return role === "ADMIN";
}
