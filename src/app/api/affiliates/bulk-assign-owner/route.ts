import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasPermissionLevel } from "@/lib/permissionGuard";
import { resolveUserPermission } from "@/lib/permissionResolver";

// POST /api/affiliates/bulk-assign-owner
// Body: { fromPersonInChargeIds: (string|null)[], toPersonInChargeId: string }
// The "from" list may contain mixed entries:
//   - "<userId>"          → match Affiliate.personInChargeId = userId
//   - "name:<text>"       → match Affiliate.personInChargeName = text (uploaded owners not yet linked)
//   - "__unassigned__" / null → match affiliates without any owner
export async function POST(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const affiliatePermission = await resolveUserPermission(auth.userId, "affiliates.records");
  if (!hasPermissionLevel(affiliatePermission, "MANAGE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { fromPersonInChargeIds, toPersonInChargeId } = await req.json();
  if (!toPersonInChargeId) {
    return NextResponse.json({ error: "toPersonInChargeId is required" }, { status: 400 });
  }

  const ids: (string | null)[] = Array.isArray(fromPersonInChargeIds)
    ? fromPersonInChargeIds
    : [fromPersonInChargeIds];

  const includesNull = ids.includes(null) || ids.includes("__unassigned__");
  const userIds = ids.filter(
    (id) =>
      id !== null &&
      id !== "__unassigned__" &&
      !(typeof id === "string" && id.startsWith("name:")),
  ) as string[];
  const uploadedNames = ids
    .filter((id) => typeof id === "string" && id.startsWith("name:"))
    .map((id) => (id as string).slice(5));

  let updated = 0;

  if (includesNull) {
    // Only truly-unassigned (no id AND no uploaded name) — avoids overlap with uploaded-name branch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (prisma.affiliate.updateMany as any)({
      where: { personInChargeId: null, personInChargeName: null },
      data: { personInChargeId: toPersonInChargeId },
    });
    updated += r.count;
  }

  if (userIds.length > 0) {
    const r = await prisma.affiliate.updateMany({
      where: { personInChargeId: { in: userIds } },
      data: { personInChargeId: toPersonInChargeId },
    });
    updated += r.count;
  }

  if (uploadedNames.length > 0) {
    // Link these uploaded text owners to the chosen User; clear the text field so they
    // no longer appear as an "uploaded" option on next refresh.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (prisma.affiliate.updateMany as any)({
      where: {
        personInChargeId: null,
        personInChargeName: { in: uploadedNames },
      },
      data: { personInChargeId: toPersonInChargeId, personInChargeName: null },
    });
    updated += r.count;
  }

  return NextResponse.json({ updated });
}
