import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

// Returns the "current owner" options for bulk-reassign.
// Mixes two sources:
//   1. In-app users currently linked via personInChargeId  (id = User.id)
//   2. Free-text owner names uploaded via Excel that aren't yet linked to a User
//      (id = "name:<text>" so bulk-assign-owner can disambiguate from real ids)
export async function GET() {
  await requireSession();

  // 1. Distinct assigned User ids
  const assignedRows = await prisma.affiliate.findMany({
    where: { personInChargeId: { not: null } },
    select: { personInChargeId: true },
    distinct: ["personInChargeId"],
  });
  const ids = assignedRows.map((r) => r.personInChargeId!).filter(Boolean);
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // 2. Distinct uploaded text names (only when no User is linked)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploadedRows = await (prisma.affiliate.findMany as any)({
    where: {
      personInChargeId: null,
      personInChargeName: { not: null },
    },
    select: { personInChargeName: true },
    distinct: ["personInChargeName"],
  });
  const uploadedNames: string[] = uploadedRows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => r.personInChargeName as string | null)
    .filter((n: string | null): n is string => !!n && n.trim().length > 0)
    .sort();

  const result = [
    ...users.map((u) => ({ id: u.id, name: u.name })),
    ...uploadedNames.map((n) => ({ id: `name:${n}`, name: `${n}（上传）` })),
  ];

  return NextResponse.json(result);
}
