import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import {
  ALL_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  FEATURES,
  PERM_LEVELS,
  PermLevel,
} from "@/lib/featurePermissions";

// GET /api/admin/permissions/role — 返回所有角色全部功能权限的当前配置
export async function GET() {
  try {
    await requireAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = await (prisma as any).rolePermission.findMany();
    const map = new Map<string, PermLevel>(
      list.map((r: { role: string; feature: string; level: string }) => [
        `${r.role}::${r.feature}`,
        r.level as PermLevel,
      ]),
    );
    const result: Record<string, Record<string, PermLevel>> = {};
    for (const role of ALL_ROLES) {
      result[role] = {};
      for (const f of FEATURES) {
        result[role][f.key] =
          map.get(`${role}::${f.key}`) ??
          (f.legacyKey ? map.get(`${role}::${f.legacyKey}`) : undefined) ??
          DEFAULT_ROLE_PERMISSIONS[role]?.[f.key] ??
          "NONE";
      }
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// POST /api/admin/permissions/role — 批量更新角色权限
// body: { role, feature, level }
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { role, feature, level } = await req.json();
    if (!ALL_ROLES.includes(role)) {
      return NextResponse.json({ error: "无效角色" }, { status: 400 });
    }
    if (!FEATURES.find((f) => f.key === feature)) {
      return NextResponse.json({ error: "无效功能" }, { status: 400 });
    }
    if (!PERM_LEVELS.includes(level)) {
      return NextResponse.json({ error: "无效权限等级" }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).rolePermission.upsert({
      where: { role_feature: { role, feature } },
      create: { role, feature, level },
      update: { level },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}
