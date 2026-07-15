import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import type { PermLevel } from "@/lib/featurePermissions";
import { reconciliationScope, customerScope, type ViewScope } from "@/lib/dataScope";
import { requireFeaturePermission, resolveSafeViewScope } from "@/lib/permissionGuard";

export const RECONCILIATION_FEATURE = "finance_customer";

type ReconciliationSession = Pick<SessionPayload, "userId" | "role" | "brandName">;

export async function getReconciliationAccess(
  session: ReconciliationSession,
  required: PermLevel,
  request?: Request,
): Promise<{
  permission: PermLevel;
  view: ViewScope;
  scope: Prisma.CustomerReconciliationWhereInput;
  customerScope: Prisma.CustomerWhereInput;
}> {
  const permission = await requireFeaturePermission(session, RECONCILIATION_FEATURE, required);
  const requested = request ? new URL(request.url).searchParams.get("scope") : null;
  const view = await resolveSafeViewScope(
    session,
    RECONCILIATION_FEATURE,
    session.role === "ADMIN" ? "all" : requested,
    permission,
  );
  const scopeSession = { userId: session.userId, role: session.role, brandName: session.brandName };
  return {
    permission,
    view,
    scope: reconciliationScope(scopeSession, view) as Prisma.CustomerReconciliationWhereInput,
    customerScope: customerScope(scopeSession, view) as Prisma.CustomerWhereInput,
  };
}

export function scopedReconciliationWhere(
  id: string,
  scope: Prisma.CustomerReconciliationWhereInput,
): Prisma.CustomerReconciliationWhereInput {
  return { AND: [{ id }, scope] };
}
