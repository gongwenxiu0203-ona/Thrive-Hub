import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function GET() {
  await requireSession();
  // Get distinct personInChargeId values from affiliates that are non-null
  const rows = await prisma.affiliate.findMany({
    where: { personInChargeId: { not: null } },
    select: { personInChargeId: true },
    distinct: ["personInChargeId"],
  });
  const ids = rows.map((r) => r.personInChargeId!).filter(Boolean);
  if (ids.length === 0) return NextResponse.json([]);

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}
