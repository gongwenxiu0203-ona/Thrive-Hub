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
  if (!session) return NextResponse.json({ error: "登录状态已失效，请重新登录后再操作" }, { status: 401 });
  if (!hasPermissionLevel(await resolveUserPermission(session.userId, "affiliates.batches"), "MANAGE")) return NextResponse.json({ error: "当前账号没有删除联盟资源批次的权限" }, { status: 403 });
  const { id } = await params;

  const batch = await prisma.affiliateBatch.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "联盟资源批次不存在、已删除或无权访问" }, { status: 404 });

  // Delete affiliates in this batch first (SetNull won't cascade delete)
  await prisma.affiliate.deleteMany({ where: { batchId: id } });
  await prisma.affiliateBatch.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
