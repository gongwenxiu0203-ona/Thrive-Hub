import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import type { PermLevel } from "@/lib/featurePermissions";
import { reconciliationScope, customerScope, isStaff, type ViewScope } from "@/lib/dataScope";
import { requireFeaturePermission, resolveSafeViewScope } from "@/lib/permissionGuard";

export const RECONCILIATION_FEATURE = "finance.customer_reconciliation";

type ReconciliationSession = Pick<SessionPayload, "userId" | "role" | "brandName">;

export async function getReconciliationAccess(
  session: ReconciliationSession,
  required: PermLevel,
  request?: Request,
  readOnly = false,
): Promise<{
  permission: PermLevel;
  view: ViewScope;
  scope: Prisma.CustomerReconciliationWhereInput;
  customerScope: Prisma.CustomerWhereInput;
}> {
  const permission = await requireFeaturePermission(session, RECONCILIATION_FEATURE, required);
  const requested = request ? new URL(request.url).searchParams.get("scope") : null;
  // 读操作：内部员工（ADMIN/USER）全量可见；写操作仍走 resolveSafeViewScope
  //（ADMIN all，其余默认 mine = 创建人/提交人/负责人）。外部角色不受 readOnly 影响。
  const view: ViewScope =
    readOnly && isStaff(session.role)
      ? "all"
      : await resolveSafeViewScope(
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
  return { AND: [{ id, deletedAt: null }, scope] };
}
