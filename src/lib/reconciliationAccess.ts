import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import type { PermLevel } from "@/lib/featurePermissions";
import { reconciliationScope, customerScope, financeDataView, type ViewScope } from "@/lib/dataScope";
import { requireFeaturePermission } from "@/lib/permissionGuard";

export const RECONCILIATION_FEATURE = "finance.customer_reconciliation";

type ReconciliationSession = Pick<SessionPayload, "userId" | "role" | "brandName">;

export async function getReconciliationAccess(
  session: ReconciliationSession,
  required: PermLevel,
  _request?: Request,
  _readOnly = false,
): Promise<{
  permission: PermLevel;
  view: ViewScope;
  scope: Prisma.CustomerReconciliationWhereInput;
  customerScope: Prisma.CustomerWhereInput;
}> {
  const permission = await requireFeaturePermission(session, RECONCILIATION_FEATURE, required);
  const scopeSession = { userId: session.userId, role: session.role, brandName: session.brandName };
  // Finance data scope is independent from the action level checked above.
  // ADMIN/USER share all records; external roles retain tenant isolation.
  const view = financeDataView(scopeSession);
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
  return { AND: [{ id, deletedAt: null }, scope] };
}
