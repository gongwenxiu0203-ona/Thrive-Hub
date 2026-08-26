import type { SessionPayload } from "@/lib/auth";
import {
  PERM_LEVELS,
  type PermLevel,
} from "@/lib/featurePermissions";
import { resolveUserPermission } from "@/lib/permissionResolver";
import type { ViewScope } from "@/lib/dataScope";

/**
 * A framework-agnostic authorization error. API routes can translate this to
 * a 403 response without coupling the shared guard to NextResponse.
 */
export class FeaturePermissionError extends Error {
  readonly status = 403;
  readonly code = "FEATURE_PERMISSION_DENIED";

  constructor(
    readonly feature: string,
    readonly required: PermLevel,
    readonly actual: PermLevel,
  ) {
    super(`Permission ${required} required for feature ${feature}`);
    this.name = "FeaturePermissionError";
  }
}

/** Compare two permission levels using the canonical project ordering. */
export function hasPermissionLevel(
  actual: PermLevel,
  required: PermLevel,
): boolean {
  return PERM_LEVELS.indexOf(actual) >= PERM_LEVELS.indexOf(required);
}

/**
 * Resolve and enforce a user's effective feature permission.
 * Returns the resolved level so callers can reuse it for view-scope decisions.
 */
export async function requireFeaturePermission(
  session: Pick<SessionPayload, "userId">,
  feature: string,
  required: PermLevel = "READ",
): Promise<PermLevel> {
  const actual = await resolveUserPermission(session.userId, feature);
  if (!hasPermissionLevel(actual, required)) {
    throw new FeaturePermissionError(feature, required, actual);
  }
  return actual;
}

/** Normalize an untrusted query value. Unknown values always fall back to mine. */
export function requestedViewScope(value: string | null | undefined): ViewScope {
  return value === "all" ? "all" : "mine";
}

/**
 * Resolve a safe row-level view scope.
 *
 * Internal ADMIN/USER accounts are feature-gated but always use the complete
 * business data scope. External roles remain pinned to their ownership scope.
 */
export async function resolveSafeViewScope(
  session: Pick<SessionPayload, "userId" | "role">,
  feature: string,
  requested: string | null | undefined,
  resolvedPermission?: PermLevel,
): Promise<ViewScope> {
  if (requestedViewScope(requested) !== "all") return "mine";
  if (session.role === "ADMIN" || session.role === "USER") return "all";

  const permission =
    resolvedPermission ??
    (await resolveUserPermission(session.userId, feature));

  return hasPermissionLevel(permission, "MANAGE") ? "all" : "mine";
}
