// 数据访问范围（行级权限） — Layer 1，所有数据查询前置过滤
//
// 角色规则：
//   BRAND   ：硬性限制，仅 Customer.brandName == user.brandName 的数据。即使有 READ 权限也无法跨品牌查看。
//   CHANNEL ：硬性限制，仅 channelUserId/createdById == user.id 的客户。
//   ADMIN/USER（内部员工）：只受功能权限控制，所有业务数据均为全量范围
//   其他角色：完全无访问

type Session = {
  userId: string;
  role: string;
  brandName?: string | null;
};

/** 视图模式：仅保留为外部角色及旧页面查询参数兼容；内部角色始终全量。 */
export type ViewScope = "mine" | "all";

export function isStaff(role: string): boolean {
  return role === "ADMIN" || role === "USER";
}

export function isExternalRole(role: string): boolean {
  return role === "BRAND" || role === "CHANNEL";
}

/**
 * Finance and operations use one shared data domain for internal staff.
 * Leaf permissions control actions; ownership only remains an audit field.
 */
export function financeDataView(session: Session): ViewScope {
  return isStaff(session.role) ? "all" : "mine";
}

/** 从查询参数读取 ViewScope（默认 "mine"） */
export function parseViewScope(
  sp: Record<string, string | undefined>,
): ViewScope {
  return sp.scope === "all" ? "all" : "mine";
}

/** Customer 行级权限 */
export function customerScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  // 外部角色：硬性限制，无视 view
  if (session.role === "BRAND" && session.brandName) {
    return { brandName: session.brandName };
  }
  if (session.role === "CHANNEL") {
    return {
      OR: [
        { channelUserId: session.userId },
        { createdById: session.userId },
      ],
    };
  }
  // 内部员工
  if (isStaff(session.role)) {
    return {};
  }
  // 未识别角色：拒绝
  return { id: "__NO_ACCESS__" };
}

/**
 * Customer scope for creation and association form references.
 *
 * Internal ADMIN/USER may select any active customer while creating or
 * associating business records. External roles retain their hard customer
 * isolation. Do not use this helper for customer list/detail visibility.
 */
export function creationReferenceCustomerScope(
  session: Session,
): Record<string, unknown> {
  return customerScope(session, isStaff(session.role) ? "all" : "mine");
}

/** Finance-specific compatibility alias for existing callers. */
export function financeReferenceCustomerScope(
  session: Session,
): Record<string, unknown> {
  return creationReferenceCustomerScope(session);
}

/** Contract 行级权限 */
export function contractScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  // 外部：通过关联客户硬性限制
  if (isExternalRole(session.role)) {
    return { customer: customerScope(session, view) };
  }
  // 内部员工
  if (isStaff(session.role)) {
    return {};
  }
  return { id: "__NO_ACCESS__" };
}

/** Customer Reconciliation 行级权限 */
export function reconciliationScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  if (isExternalRole(session.role)) {
    return { customer: customerScope(session, view) };
  }
  if (isStaff(session.role)) {
    return {};
  }
  return { id: "__NO_ACCESS__" };
}

/** Channel Reconciliation 行级权限 */
export function channelReconciliationScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  if (session.role === "CHANNEL") {
    return { channelUserId: session.userId };
  }
  if (session.role === "BRAND" && session.brandName) {
    return { customer: { brandName: session.brandName } };
  }
  if (isStaff(session.role)) {
    return {};
  }
  return { id: "__NO_ACCESS__" };
}

/** Task 行级权限 */
export function taskScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  if (isExternalRole(session.role)) {
    return {
      OR: [
        { customer: customerScope(session, view) },
        { ownerId: session.userId },
        { publisherId: session.userId },
      ],
    };
  }
  if (isStaff(session.role)) {
    return {};
  }
  return { id: "__NO_ACCESS__" };
}

/** SalesRecord (BI) 行级权限 */
export function salesScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  if (session.role === "BRAND" && session.brandName) {
    return { brand: session.brandName };
  }
  if (session.role === "CHANNEL") {
    return { customer: customerScope(session, view) };
  }
  if (isStaff(session.role)) {
    return {};
  }
  return { id: "__NO_ACCESS__" };
}

/** Reminder：内部人员可按功能权限查看全量；外部角色仅查看自己的收件记录。 */
export function reminderScope(session: Session): Record<string, unknown> {
  return isStaff(session.role) ? {} : { targetId: session.userId };
}

/** Project 行级权限：BRAND/CHANNEL 完全禁入；内部员工按功能权限访问全量。 */
export function projectScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  if (isExternalRole(session.role)) {
    return { id: "__NO_ACCESS__" };
  }
  if (isStaff(session.role)) {
    return {};
  }
  return { id: "__NO_ACCESS__" };
}

/** 员工 KPI 行级权限（作用于 ProjectGmvTarget）。
 *  ADMIN/USER：按功能权限访问全量；
 *  BRAND/CHANNEL：完全禁入（上层路由再加一道隐藏拦截）。 */
export function kpiScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  if (isExternalRole(session.role)) {
    return { id: "__NO_ACCESS__" };
  }
  if (isStaff(session.role)) {
    return {};
  }
  return { id: "__NO_ACCESS__" };
}

/** 校验外部角色对单条记录的访问权限（详情页用） */
export function canExternalAccessCustomer(
  session: Session,
  customer: { brandName: string; channelUserId: string | null; createdById: string | null },
): boolean {
  if (session.role === "BRAND" && session.brandName) {
    return customer.brandName === session.brandName;
  }
  if (session.role === "CHANNEL") {
    return (
      customer.channelUserId === session.userId ||
      customer.createdById === session.userId
    );
  }
  return true; // 内部员工不受详情页跨记录访问限制
}
