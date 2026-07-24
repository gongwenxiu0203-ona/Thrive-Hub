// 权限解析：用户实际权限 = 用户覆盖 > 角色 DB 配置 > 角色默认值
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_ROLE_PERMISSIONS,
  FEATURE_BY_KEY,
  FEATURES,
  LEGACY_FEATURE_ALIASES,
  PermLevel,
} from "@/lib/featurePermissions";

/** 解析用户对某功能的权限（优先级：用户覆盖 > DB 角色配置 > 默认值） */
export async function resolveUserPermission(
  userId: string,
  feature: string,
): Promise<PermLevel> {
  const canonicalFeature = LEGACY_FEATURE_ALIASES[feature] ?? feature;
  // 1) 用户覆盖
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const override = await (prisma as any).userPermissionOverride.findUnique({
    where: { userId_feature: { userId, feature } },
  });
  if (override) return override.level as PermLevel;
  if (canonicalFeature !== feature) {
    const canonicalOverride = await (prisma as any).userPermissionOverride.findUnique({
      where: { userId_feature: { userId, feature: canonicalFeature } },
    });
    if (canonicalOverride) return canonicalOverride.level as PermLevel;
  }
  const legacyKey = FEATURE_BY_KEY.get(canonicalFeature)?.legacyKey;
  if (legacyKey) {
    const legacyOverride = await (prisma as any).userPermissionOverride.findUnique({
      where: { userId_feature: { userId, feature: legacyKey } },
    });
    if (legacyOverride) return legacyOverride.level as PermLevel;
  }

  // 2) 该用户角色
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return "NONE";

  // 3) DB 中的角色配置（可能覆盖默认值）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roleSetting = await (prisma as any).rolePermission.findUnique({
    where: { role_feature: { role: user.role, feature } },
  });
  if (roleSetting) return roleSetting.level as PermLevel;
  if (canonicalFeature !== feature) {
    const canonicalRoleSetting = await (prisma as any).rolePermission.findUnique({
      where: { role_feature: { role: user.role, feature: canonicalFeature } },
    });
    if (canonicalRoleSetting) return canonicalRoleSetting.level as PermLevel;
  }
  if (legacyKey) {
    const legacyRoleSetting = await (prisma as any).rolePermission.findUnique({
      where: { role_feature: { role: user.role, feature: legacyKey } },
    });
    if (legacyRoleSetting) return legacyRoleSetting.level as PermLevel;
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
      o.level as PermLevel,
    ]),
  );
  const roleMap = new Map<string, PermLevel>(
    roleSettings.map((r: { feature: string; level: string }) => [
      r.feature,
      r.level as PermLevel,
    ]),
  );

  const result: Record<string, PermLevel> = {};
  for (const f of FEATURES) {
    result[f.key] =
      overrideMap.get(f.key) ??
      (f.legacyKey ? overrideMap.get(f.legacyKey) : undefined) ??
      roleMap.get(f.key) ??
      (f.legacyKey ? roleMap.get(f.legacyKey) : undefined) ??
      DEFAULT_ROLE_PERMISSIONS[user.role]?.[f.key] ??
      "NONE";
  }
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
      r.level as PermLevel,
    ]),
  );
  const result: Record<string, PermLevel> = {};
  for (const f of FEATURES) {
    result[f.key] =
      map.get(f.key) ??
      (f.legacyKey ? map.get(f.legacyKey) : undefined) ??
      DEFAULT_ROLE_PERMISSIONS[role]?.[f.key] ??
      "NONE";
  }
  return result;
}
