import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminHasFeature, getSession } from "@/lib/session";
import {
  getRolePermissions,
  resolveUserPermission,
  resolveUserPermissionsMap,
} from "@/lib/permissionResolver";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import {
  FEATURES,
  PERM_LEVELS,
} from "@/lib/featurePermissions";

// GET /api/admin/permissions/user/[id] — 返回该用户的实际权限（已应用覆盖）
// + 覆盖明细列表
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!await adminHasFeature(session, "admin.permissions", "READ")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const effective = await resolveUserPermissionsMap(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overrides = await (prisma as any).userPermissionOverride.findMany({
      where: { userId: id },
    });
    const rawOverrideKeys = new Set(
      overrides.map((o: { feature: string }) => o.feature),
    );
    const overrideKeys = FEATURES
      .filter((feature) =>
        rawOverrideKeys.has(feature.key)
        || Boolean(feature.legacyKey && rawOverrideKeys.has(feature.legacyKey)))
      .map((feature) => feature.key);
    return NextResponse.json({
      user,
      effective,
      overrideKeys,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// POST /api/admin/permissions/user/[id] — 更新单个用户的某功能覆盖
// body: { feature, level, reset? }
//   reset=true 删除覆盖（恢复为角色默认值）
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!await adminHasFeature(session, "admin.permissions", "MANAGE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const { feature, level, reset } = await req.json();

    if (!FEATURES.find((f) => f.key === feature)) {
      return NextResponse.json({ error: "无效功能" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true, status: true },
    });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (target.role === "ADMIN" && target.status === "APPROVED" && feature === "admin.permissions") {
      const currentLevel = await resolveUserPermission(id, feature);
      const rolePermissions = reset ? await getRolePermissions(target.role) : null;
      const nextLevel = reset ? rolePermissions?.[feature] ?? "NONE" : level;
      if (hasPermissionLevel(currentLevel, "MANAGE") && !hasPermissionLevel(nextLevel, "MANAGE")) {
        const otherAdmins = await prisma.user.findMany({
          where: { id: { not: id }, role: "ADMIN", status: "APPROVED" },
          select: { id: true },
        });
        let hasOtherManager = false;
        for (const admin of otherAdmins) {
          if (hasPermissionLevel(await resolveUserPermission(admin.id, feature), "MANAGE")) {
            hasOtherManager = true;
            break;
          }
        }
        if (!hasOtherManager) {
          return NextResponse.json(
            { error: "必须保留至少一名已启用且可管理权限的管理员" },
            { status: 409 },
          );
        }
      }
    }

    if (reset) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).userPermissionOverride
        .delete({ where: { userId_feature: { userId: id, feature } } })
        .catch(() => null);
      return NextResponse.json({ success: true, reset: true });
    }

    if (!PERM_LEVELS.includes(level)) {
      return NextResponse.json({ error: "无效权限等级" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).userPermissionOverride.upsert({
      where: { userId_feature: { userId: id, feature } },
      create: { userId: id, feature, level },
      update: { level },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}
