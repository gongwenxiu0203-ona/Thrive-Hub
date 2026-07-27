import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermissionLevel(await resolveUserPermission(session.userId, "affiliates.batches"), "MANAGE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const batch = await prisma.affiliateBatch.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete affiliates in this batch first (SetNull won't cascade delete)
  await prisma.affiliate.deleteMany({ where: { batchId: id } });
  await prisma.affiliateBatch.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
