import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "./auth";
import { resolveUserPermission } from "./permissionResolver";
import { hasPermissionLevel } from "./permissionGuard";
import type { PermLevel } from "./featurePermissions";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/dashboard");
  return session;
}

/** System-management pages always require the ADMIN role plus the configured leaf permission. */
export async function requireAdminFeature(
  feature: string,
  required: PermLevel = "READ",
): Promise<SessionPayload> {
  const session = await requireAdmin();
  const permission = await resolveUserPermission(session.userId, feature);
  if (!hasPermissionLevel(permission, required)) redirect("/dashboard");
  return session;
}

/** API-friendly ADMIN + leaf check; callers retain control over 401/403 responses. */
export async function adminHasFeature(
  session: SessionPayload,
  feature: string,
  required: PermLevel = "READ",
): Promise<boolean> {
  if (session.role !== "ADMIN") return false;
  return hasPermissionLevel(
    await resolveUserPermission(session.userId, feature),
    required,
  );
}
