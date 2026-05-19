import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// POST /api/affiliates/bulk-assign-owner
// Body: { fromPersonInChargeIds: (string|null)[], toPersonInChargeId: string }
export async function POST(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fromPersonInChargeIds, toPersonInChargeId } = await req.json();
  if (!toPersonInChargeId) {
    return NextResponse.json({ error: "toPersonInChargeId is required" }, { status: 400 });
  }

  const ids: (string | null)[] = Array.isArray(fromPersonInChargeIds)
    ? fromPersonInChargeIds
    : [fromPersonInChargeIds];

  const includesNull = ids.includes(null) || ids.includes("__unassigned__");
  const realIds = ids.filter((id) => id !== null && id !== "__unassigned__") as string[];

  let updated = 0;

  if (includesNull) {
    const r = await prisma.affiliate.updateMany({
      where: { personInChargeId: null },
      data: { personInChargeId: toPersonInChargeId },
    });
    updated += r.count;
  }

  if (realIds.length > 0) {
    const r = await prisma.affiliate.updateMany({
      where: { personInChargeId: { in: realIds } },
      data: { personInChargeId: toPersonInChargeId },
    });
    updated += r.count;
  }

  return NextResponse.json({ updated });
}
