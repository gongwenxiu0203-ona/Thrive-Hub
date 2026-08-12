// 权限解析：用户实际权限 = 用户覆盖 > 角色 DB 配置 > 角色默认值
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_ROLE_PERMISSIONS,
  FEATURE_BY_KEY,
  FEATURES,
  LEGACY_FEATURE_ALIASES,
  PERM_LEVELS,
  PermLevel,
} from "@/lib/featurePermissions";

export function validPermissionLevel(value: unknown): PermLevel | undefined {
  return typeof value === "string" && PERM_LEVELS.includes(value as PermLevel)
    ? (value as PermLevel)
    : undefined;
}

export type StoredPermission = { feature: string; level: string };

/**
 * Pure effective-permission resolver used by DB-backed resolution and unit tests.
 * Canonical rows always win; legacy rows are read-only compatibility for v1.2.x.
 */
export function resolveEffectivePermission({
  role,
  feature,
  userPermissions = [],
  rolePermissions = [],
}: {
  role: string;
  feature: string;
  userPermissions?: StoredPermission[];
  rolePermissions?: StoredPermission[];
}): PermLevel {
  const canonicalFeature = LEGACY_FEATURE_ALIASES[feature] ?? feature;
  if (!FEATURE_BY_KEY.has(canonicalFeature)) return "NONE";
  if (!FEATURE_BY_KEY.has(canonicalFeature)) return "NONE";
  const legacyKey = FEATURE_BY_KEY.get(canonicalFeature)?.legacyKey;
  const userMap = new Map(userPermissions.map((row) => [row.feature, row.level]));
  const roleMap = new Map(rolePermissions.map((row) => [row.feature, row.level]));
  return (
    validPermissionLevel(userMap.get(canonicalFeature)) ??
    (legacyKey ? validPermissionLevel(userMap.get(legacyKey)) : undefined) ??
    validPermissionLevel(roleMap.get(canonicalFeature)) ??
    (legacyKey ? validPermissionLevel(roleMap.get(legacyKey)) : undefined) ??
    DEFAULT_ROLE_PERMISSIONS[role]?.[canonicalFeature] ??
    "NONE"
  );
}

/** 解析用户对某功能的权限（优先级：用户覆盖 > DB 角色配置 > 默认值） */
export async function resolveUserPermission(
  userId: string,
  feature: string,
): Promise<PermLevel> {
  const canonicalFeature = LEGACY_FEATURE_ALIASES[feature] ?? feature;
  // 1) 用户覆盖
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canonicalOverride = await (prisma as any).userPermissionOverride.findUnique({
    where: { userId_feature: { userId, feature: canonicalFeature } },
  });
  const canonicalOverrideLevel = validPermissionLevel(canonicalOverride?.level);
  if (canonicalOverrideLevel) return canonicalOverrideLevel;
  const legacyKey = FEATURE_BY_KEY.get(canonicalFeature)?.legacyKey;
  if (legacyKey) {
    const legacyOverride = await (prisma as any).userPermissionOverride.findUnique({
      where: { userId_feature: { userId, feature: legacyKey } },
    });
    const legacyOverrideLevel = validPermissionLevel(legacyOverride?.level);
    if (legacyOverrideLevel) return legacyOverrideLevel;
  }

  // 2) 该用户角色
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return "NONE";

  // 3) DB 中的角色配置（可能覆盖默认值）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canonicalRoleSetting = await (prisma as any).rolePermission.findUnique({
    where: { role_feature: { role: user.role, feature: canonicalFeature } },
  });
  const canonicalRoleLevel = validPermissionLevel(canonicalRoleSetting?.level);
  if (canonicalRoleLevel) return canonicalRoleLevel;
  if (legacyKey) {
    const legacyRoleSetting = await (prisma as any).rolePermission.findUnique({
      where: { role_feature: { role: user.role, feature: legacyKey } },
    });
    const legacyRoleLevel = validPermissionLevel(legacyRoleSetting?.level);
    if (legacyRoleLevel) return legacyRoleLevel;
  }

  // 4) 兜底：默认配置
  return (
    DEFAULT_ROLE_PERMISSIONS[user.role]?.[canonicalFeature] ?? "NONE"
  );
}

/** 一次性获取用户对所有功能的权限 map */
export async function resolveUserPermissionsMap(
  userId: string,
): Promise<Record<string, PermLevel>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) {
    const empty: Record<string, PermLevel> = {};
    for (const f of FEATURES) empty[f.key] = "NONE";
    return empty;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [overrides, roleSettings] = await Promise.all([
    (prisma as any).userPermissionOverride.findMany({ where: { userId } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).rolePermission.findMany({ where: { role: user.role } }),
  ]);

  const overrideMap = new Map<string, PermLevel>(
    overrides.map((o: { feature: string; level: string }) => [
      o.feature,
      validPermissionLevel(o.level),
    ]).filter((entry: [string, PermLevel | undefined]): entry is [string, PermLevel] => Boolean(entry[1])),
  );
  const roleMap = new Map<string, PermLevel>(
    roleSettings.map((r: { feature: string; level: string }) => [
      r.feature,
      validPermissionLevel(r.level),
    ]).filter((entry: [string, PermLevel | undefined]): entry is [string, PermLevel] => Boolean(entry[1])),
  );

  const userRows = Array.from(overrideMap, ([feature, level]) => ({ feature, level }));
  const roleRows = Array.from(roleMap, ([feature, level]) => ({ feature, level }));
  const result: Record<string, PermLevel> = {};
  for (const f of FEATURES) result[f.key] = resolveEffectivePermission({
    role: user.role,
    feature: f.key,
    userPermissions: userRows,
    rolePermissions: roleRows,
  });
  return result;
}

/** 获取角色当前配置（DB 优先，回退默认值） */
export async function getRolePermissions(
  role: string,
): Promise<Record<string, PermLevel>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = await (prisma as any).rolePermission.findMany({ where: { role } });
  const map = new Map<string, PermLevel>(
    list.map((r: { feature: string; level: string }) => [
      r.feature,
      validPermissionLevel(r.level),
    ]).filter((entry: [string, PermLevel | undefined]): entry is [string, PermLevel] => Boolean(entry[1])),
  );
  const roleRows = Array.from(map, ([feature, level]) => ({ feature, level }));
  const result: Record<string, PermLevel> = {};
  for (const f of FEATURES) result[f.key] = resolveEffectivePermission({
    role,
    feature: f.key,
    rolePermissions: roleRows,
  });
  return result;
}
