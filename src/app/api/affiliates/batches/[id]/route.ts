import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await params;

  const batch = await prisma.affiliateBatch.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only admins or the uploader can delete
  if (session.role !== "ADMIN" && batch.uploaderId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete affiliates in this batch first (SetNull won't cascade delete)
  await prisma.affiliate.deleteMany({ where: { batchId: id } });
  await prisma.affiliateBatch.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
