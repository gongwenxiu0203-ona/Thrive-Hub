import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermissionLevel(await resolveUserPermission(session.userId, "affiliates.batches"), "READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const batches = await prisma.affiliateBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: { uploader: { select: { id: true, name: true } } },
  });
  return NextResponse.json(batches);
}
