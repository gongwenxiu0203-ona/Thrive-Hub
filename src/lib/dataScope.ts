// 数据访问范围（行级权限） — Layer 1，所有数据查询前置过滤
//
// 角色规则：
//   BRAND   ：硬性限制，仅 Customer.brandName == user.brandName 的数据。即使有 READ 权限也无法跨品牌查看。
//   CHANNEL ：硬性限制，仅 channelUserId/createdById == user.id 的客户。
//   ADMIN/USER（内部员工）：默认显示自己相关的（"我的"），但可通过 ?scope=all 切换到全部
//   其他角色：完全无访问

type Session = {
  userId: string;
  role: string;
  brandName?: string | null;
};

/** 视图模式：staff 默认 "mine"（仅自己相关），"all" 查看全部 */
export type ViewScope = "mine" | "all";

export function isStaff(role: string): boolean {
  return role === "ADMIN" || role === "USER";
}

export function isExternalRole(role: string): boolean {
  return role === "BRAND" || role === "CHANNEL";
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
    if (view === "all") return {};
    // 默认仅显示自己相关的
    return {
      OR: [
        { businessOwnerId: session.userId },
        { backendOwnerId: session.userId },
        { createdById: session.userId },
      ],
    };
  }
  // 未识别角色：拒绝
  return { id: "__NO_ACCESS__" };
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
    if (view === "all") return {};
    return {
      OR: [
        { ownerId: session.userId },
        { createdById: session.userId },
        { reviewerId: session.userId },
        { customer: { businessOwnerId: session.userId } },
        { customer: { backendOwnerId: session.userId } },
      ],
    };
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
    if (view === "all") return {};
    return {
      OR: [
        { createdById: session.userId },
        { submittedById: session.userId },
        { submittedToUserId: session.userId },
        { customer: { businessOwnerId: session.userId } },
      ],
    };
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
    if (view === "all") return {};
    return {
      OR: [
        { createdById: session.userId },
        { customer: { businessOwnerId: session.userId } },
        { customer: { backendOwnerId: session.userId } },
      ],
    };
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
    if (view === "all") return {};
    return {
      OR: [
        { ownerId: session.userId },
        { publisherId: session.userId },
        { customer: { businessOwnerId: session.userId } },
      ],
    };
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
    if (view === "all") return {};
    // 内部员工"我的"：仅自己负责的客户的销售数据
    return { customer: customerScope(session, "mine") };
  }
  return { id: "__NO_ACCESS__" };
}

/** Reminder：本身按 targetId 过滤 */
export function reminderScope(session: Session): Record<string, unknown> {
  return { targetId: session.userId };
}

/** Project 行级权限：BRAND/CHANNEL 完全禁入；内部员工 "mine" 匹配 owner/创建人/客户负责人。 */
export function projectScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  if (isExternalRole(session.role)) {
    return { id: "__NO_ACCESS__" };
  }
  if (isStaff(session.role)) {
    if (view === "all") return {};
    return {
      OR: [
        { ownerId: session.userId },
        { createdById: session.userId },
        { customer: { backendOwnerId: session.userId } },
        { customer: { businessOwnerId: session.userId } },
      ],
    };
  }
  return { id: "__NO_ACCESS__" };
}

/** 员工 KPI 行级权限（作用于 ProjectGmvTarget）。
 *  ADMIN（all）：无过滤；
 *  非 ADMIN 或 mine：仅自己作为 Strategy AM / 项目 owner / 客户售前方案负责人的项目目标。
 *  BRAND/CHANNEL：完全禁入（上层路由再加一道隐藏拦截）。 */
export function kpiScope(
  session: Session,
  view: ViewScope = "mine",
): Record<string, unknown> {
  if (isExternalRole(session.role)) {
    return { id: "__NO_ACCESS__" };
  }
  if (isStaff(session.role)) {
    if (view === "all" && session.role === "ADMIN") return {};
    return {
      OR: [
        { amOwnerId: session.userId },
        { project: { ownerId: session.userId } },
        { project: { customer: { backendOwnerId: session.userId } } },
      ],
    };
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
