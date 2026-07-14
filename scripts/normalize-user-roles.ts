import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const legacyStaff = await tx.user.updateMany({
      where: { role: "LYNQ_STAFF" },
      data: { role: "USER" },
    });
    const legacyGuests = await tx.user.updateMany({
      where: { role: "GUEST" },
      data: { role: "USER", status: "PENDING" },
    });

    const legacyStaffPermissions = await tx.rolePermission.findMany({
      where: { role: "LYNQ_STAFF" },
      select: { feature: true, level: true },
    });
    let copiedPermissions = 0;
    for (const permission of legacyStaffPermissions) {
      const existing = await tx.rolePermission.findFirst({
        where: { role: "USER", feature: permission.feature },
        select: { id: true },
      });
      if (!existing) {
        await tx.rolePermission.create({
          data: { role: "USER", feature: permission.feature, level: permission.level },
        });
        copiedPermissions += 1;
      }
    }

    const removedLegacyPermissions = await tx.rolePermission.deleteMany({
      where: { role: { in: ["LYNQ_STAFF", "GUEST"] } },
    });

    return {
      legacyStaffUsers: legacyStaff.count,
      legacyGuestUsers: legacyGuests.count,
      copiedPermissions,
      removedLegacyPermissions: removedLegacyPermissions.count,
    };
  });

  console.log("Role normalization completed:", result);
  console.log("No customer, contract, project, BI, or finance records were changed.");
}

main()
  .catch((error) => {
    console.error("Role normalization failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
