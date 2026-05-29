import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { resolveUserPermissionsMap } from "@/lib/permissionResolver";
import {
  FEATURES,
  PERM_LEVELS,
  DEFAULT_ROLE_PERMISSIONS,
} from "@/lib/featurePermissions";

// GET /api/admin/permissions/user/[id] — 返回该用户的实际权限（已应用覆盖）
// + 覆盖明细列表
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
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
    const overrideKeys = new Set(
      overrides.map((o: { feature: string }) => o.feature),
    );
    return NextResponse.json({
      user,
      effective,
      overrideKeys: [...overrideKeys],
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
    await requireAdmin();
    const { id } = await params;
    const { feature, level, reset } = await req.json();

    if (!FEATURES.find((f) => f.key === feature)) {
      return NextResponse.json({ error: "无效功能" }, { status: 400 });
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

    // 如果设置的等级 == 角色默认值，直接删除覆盖（保持表干净）
    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    const defaultLevel = user
      ? DEFAULT_ROLE_PERMISSIONS[user.role]?.[feature] ?? "NONE"
      : "NONE";

    if (level === defaultLevel) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).userPermissionOverride
        .delete({ where: { userId_feature: { userId: id, feature } } })
        .catch(() => null);
      return NextResponse.json({ success: true, removed: true });
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
