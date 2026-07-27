import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";

const ALLOWED = new Set([
  "region", "personInChargeId", "source", "category",
  "affiliateType", "tags", "brand", "developmentStatus", "cooperationMode",
]);
const ARRAY_FIELDS = new Set(["tags", "cooperationMode"]);

export async function PATCH(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermissionLevel(await resolveUserPermission(auth.userId, "affiliates.batches"), "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { ids, field, value } = await req.json();

  if (!Array.isArray(ids) || ids.length === 0 || !field) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!ALLOWED.has(field)) {
    return NextResponse.json({ error: "Field not allowed" }, { status: 400 });
  }

  if (ARRAY_FIELDS.has(field)) {
    const affiliates = await prisma.affiliate.findMany({
      where: { id: { in: ids } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: { id: true, [field]: true } as any,
    });
    await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      affiliates.map((a: any) => {
        let current: string[] = [];
        try {
          const parsed = JSON.parse(a[field] ?? "[]");
          if (Array.isArray(parsed)) current = parsed;
        } catch { /* ignore */ }
        const newVals: string[] = Array.isArray(value) ? value : [value];
        const merged = [...new Set([...current, ...newVals])];
        return prisma.affiliate.update({
          where: { id: a.id },
          data: { [field]: JSON.stringify(merged) },
        });
      })
    );
  } else {
    await prisma.affiliate.updateMany({
      where: { id: { in: ids } },
      data: { [field]: value ?? null },
    });
  }

  return NextResponse.json({ updated: ids.length });
}
